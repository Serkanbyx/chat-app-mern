import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { ApiError } from './apiError.js';
import { assertParticipant, resetUnread } from './conversationService.js';
import { escapeRegex } from './escapeRegex.js';
import { env } from '../config/env.js';
import {
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  MESSAGE_TEXT_MAX_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS,
  REACTION_EMOJI_MAX_LENGTH,
  ROLES,
} from './constants.js';

const { Types } = mongoose;

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value._id) return value._id.toString();
  return null;
};

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  Types.ObjectId.isValid(value) &&
  /^[a-f0-9]{24}$/i.test(value);

/**
 * Public sender shape exposed to clients. We never include email, role,
 * status, preferences, or any field that isn't strictly needed to render
 * a message bubble.
 */
const SENDER_PROJECTION = '_id username displayName avatarUrl';

/**
 * Allowed Cloudinary CDN host for image messages. Built once at module
 * load — if cloud name is missing (e.g. local dev), image messages are
 * rejected outright rather than accepting arbitrary URLs.
 */
const buildAllowedCloudinaryPrefixes = () => {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) return [];
  return [
    `https://res.cloudinary.com/${cloudName}/`,
    `http://res.cloudinary.com/${cloudName}/`,
  ];
};

const ALLOWED_IMAGE_PREFIXES = buildAllowedCloudinaryPrefixes();

const isAllowedCloudinaryUrl = (url) => {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (ALLOWED_IMAGE_PREFIXES.length === 0) return false;
  return ALLOWED_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix));
};

/**
 * Resolve the bidirectional block state between the viewer and the OTHER
 * participant of a direct conversation. Returns the earliest `blockedAt`
 * across both directions — read-time enforcement uses it as the cutoff
 * for hiding messages.
 *
 * Group chats are intentionally exempt: per spec, group context is shared
 * and a block does not silence traffic inside an already-joined group.
 */
const getDirectBlockState = async ({ conversation, viewerId }) => {
  if (!conversation || conversation.type !== CONVERSATION_TYPES.DIRECT) {
    return { otherId: null, cutoffAt: null, viewerBlocked: false, theyBlocked: false };
  }

  const vid = toIdString(viewerId);
  const otherRaw = (conversation.participants || []).find(
    (p) => toIdString(p) !== vid,
  );
  const otherId = toIdString(otherRaw);
  if (!otherId) {
    return { otherId: null, cutoffAt: null, viewerBlocked: false, theyBlocked: false };
  }

  // Two parallel queries (`me` and `them`) — could be condensed into one
  // `$in` query but readability wins over a single round-trip here.
  const [me, them] = await Promise.all([
    User.findById(vid).select('blockedUsers').lean(),
    User.findById(otherId).select('blockedUsers').lean(),
  ]);

  const myBlock = (me?.blockedUsers || []).find(
    (entry) => String(entry?.user) === otherId,
  );
  const theirBlock = (them?.blockedUsers || []).find(
    (entry) => String(entry?.user) === vid,
  );

  // Earliest cutoff wins so the strictest side dictates visibility.
  let cutoffAt = null;
  if (myBlock?.blockedAt) cutoffAt = new Date(myBlock.blockedAt);
  if (theirBlock?.blockedAt) {
    const t = new Date(theirBlock.blockedAt);
    if (!cutoffAt || t < cutoffAt) cutoffAt = t;
  }

  return {
    otherId,
    cutoffAt,
    viewerBlocked: Boolean(myBlock),
    theyBlocked: Boolean(theirBlock),
  };
};

/**
 * Persist a new message after validating the caller's membership in the
 * conversation. Returns the saved message with `sender` populated using
 * the public projection so it's safe to send straight to clients.
 *
 * The post-save hook on the Message model handles `lastMessage` snapshot
 * refresh and `unreadCounts` bumping for every other participant.
 */
export const createMessage = async ({
  conversationId,
  senderId,
  type = MESSAGE_TYPES.TEXT,
  text = '',
  imageUrl = '',
  imagePublicId = '',
  replyTo = null,
}) => {
  const cid = toIdString(conversationId);
  const sid = toIdString(senderId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!sid || !isValidObjectId(sid)) {
    throw ApiError.badRequest('Invalid sender id');
  }

  if (!Object.values(MESSAGE_TYPES).includes(type)) {
    throw ApiError.badRequest('Invalid message type');
  }
  // System messages are produced by server-side flows (member added/left,
  // group renamed, etc.), never by an authenticated user request.
  if (type === MESSAGE_TYPES.SYSTEM) {
    throw ApiError.forbidden('System messages cannot be created via this API');
  }

  const conversation = await Conversation.findById(cid);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  // Source-of-truth access control: must be a participant to write.
  assertParticipant(conversation, sid);

  // Block enforcement on the WRITE path. We reject 403 in BOTH directions
  // (I blocked them OR they blocked me) so the channel is symmetrically
  // closed and impossible to bypass via the client.
  if (conversation.type === CONVERSATION_TYPES.DIRECT) {
    const { viewerBlocked, theyBlocked } = await getDirectBlockState({
      conversation,
      viewerId: sid,
    });
    if (viewerBlocked) {
      throw ApiError.forbidden('You have blocked this user');
    }
    if (theyBlocked) {
      throw ApiError.forbidden('You can no longer message this user');
    }
  }

  const payload = {
    conversationId: cid,
    sender: sid,
    type,
    replyTo: null,
  };

  if (type === MESSAGE_TYPES.TEXT) {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length === 0) {
      throw ApiError.badRequest('Text message cannot be empty');
    }
    if (trimmed.length > MESSAGE_TEXT_MAX_LENGTH) {
      throw ApiError.badRequest(
        `Text message must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
      );
    }
    payload.text = trimmed;
  }

  if (type === MESSAGE_TYPES.IMAGE) {
    if (!isAllowedCloudinaryUrl(imageUrl)) {
      // Anything that isn't a server-issued Cloudinary URL is a forgery
      // attempt — never let it touch the database.
      throw ApiError.badRequest('Invalid image url');
    }
    payload.imageUrl = imageUrl;
    payload.imagePublicId =
      typeof imagePublicId === 'string' ? imagePublicId : '';
  }

  // replyTo is optional. We verify it points to a real message in the
  // SAME conversation — quoting an unrelated message would leak content
  // across conversations the user doesn't belong to.
  if (replyTo) {
    const rid = toIdString(replyTo);
    if (!rid || !isValidObjectId(rid)) {
      throw ApiError.badRequest('Invalid replyTo id');
    }
    const parent = await Message.findById(rid).select('conversationId');
    if (!parent || parent.conversationId.toString() !== cid) {
      throw ApiError.badRequest('replyTo must reference a message in the same conversation');
    }
    payload.replyTo = rid;
  }

  const message = await Message.create(payload);
  return message.populate({ path: 'sender', select: SENDER_PROJECTION });
};

/**
 * Mark every message in the conversation as read by `userId` and reset
 * their unread counter to zero. Idempotent: messages already containing
 * a readBy entry for the user are not touched again.
 */
export const markConversationAsRead = async ({ conversationId, userId }) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const conversation = await Conversation.findById(cid).select('participants');
  if (!conversation) throw ApiError.notFound('Conversation not found');
  assertParticipant(conversation, uid);

  const result = await Message.updateMany(
    {
      conversationId: cid,
      // Don't mark your own messages as read — meaningless and inflates the
      // readBy array unnecessarily.
      sender: { $ne: new Types.ObjectId(uid) },
      // Idempotent: skip messages already read by this user.
      'readBy.user': { $ne: new Types.ObjectId(uid) },
    },
    { $push: { readBy: { user: uid, at: new Date() } } },
  );

  await resetUnread(cid, uid);

  return { matched: result.matchedCount ?? 0, modified: result.modifiedCount ?? 0 };
};

/**
 * Authorization gate for editing or deleting a message. Centralizes the
 * "who is allowed to do what, and within what time window" rules so
 * controllers and socket handlers stay thin.
 *
 * Actions:
 *  - 'edit'              — only sender, only text type, only within
 *                          MESSAGE_EDIT_WINDOW_MS of createdAt.
 *  - 'deleteForEveryone' — sender within MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS,
 *                          OR an admin (passed via `actor`).
 *  - 'deleteForSelf'     — any participant; participant check is the
 *                          caller's responsibility (use assertParticipant).
 */
export const assertCanModifyMessage = (
  message,
  actor,
  { action = 'edit' } = {},
) => {
  if (!message) throw ApiError.notFound('Message not found');
  if (!actor) throw ApiError.unauthorized('Unauthenticated');

  const actorId = toIdString(actor);
  if (!actorId) throw ApiError.unauthorized('Unauthenticated');

  const senderId = toIdString(message.sender);
  const isAdmin = actor.role === ROLES.ADMIN;

  if (message.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    throw ApiError.badRequest('Message has already been deleted');
  }

  switch (action) {
    case 'edit': {
      if (senderId !== actorId) {
        throw ApiError.forbidden('Only the sender can edit this message');
      }
      if (message.type !== MESSAGE_TYPES.TEXT) {
        throw ApiError.badRequest('Only text messages can be edited');
      }
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      if (ageMs > MESSAGE_EDIT_WINDOW_MS) {
        throw ApiError.forbidden('Edit window has expired');
      }
      return;
    }

    case 'deleteForEveryone': {
      if (isAdmin) return;
      if (senderId !== actorId) {
        throw ApiError.forbidden(
          'Only the sender can delete this message for everyone',
        );
      }
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      if (ageMs > MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS) {
        throw ApiError.forbidden('Delete-for-everyone window has expired');
      }
      return;
    }

    case 'deleteForSelf':
      // Any participant may hide a message from their own view. The caller
      // is responsible for asserting participant membership beforehand.
      return;

    default:
      throw ApiError.badRequest('Unknown modify action');
  }
};

/**
 * Cursor-based pagination for chat history. Cursor pagination outperforms
 * offset for append-only streams: stable in the face of concurrent inserts
 * and free of the deepening-skip cost as users scroll back through years
 * of history.
 *
 * Returns messages strictly OLDER than `before` (or the most recent ones
 * when no cursor is supplied). Caller-controlled `limit` is clamped at the
 * route level to defuse single-request data exfiltration.
 */
export const listMessages = async ({
  conversationId,
  userId,
  before = null,
  limit = 30,
}) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const conversation = await Conversation.findById(cid).select(
    'participants type',
  );
  assertParticipant(conversation, uid);

  const filter = {
    conversationId: cid,
    // Per-user "delete for self" tombstones — filtered out of the requester's
    // view without destroying the row for the rest of the participants.
    hiddenFor: { $ne: new Types.ObjectId(uid) },
  };

  // Direct-conversation block filter: hide messages from the OTHER party
  // that were created AFTER the block was placed. History before the
  // cutoff stays intact (preserves context). Group chats are exempt.
  if (conversation.type === CONVERSATION_TYPES.DIRECT) {
    const { otherId, cutoffAt } = await getDirectBlockState({
      conversation,
      viewerId: uid,
    });
    if (otherId && cutoffAt) {
      filter.$nor = (filter.$nor || []).concat({
        sender: new Types.ObjectId(otherId),
        createdAt: { $gt: cutoffAt },
      });
    }
  }

  if (before) {
    const bid = toIdString(before);
    if (!bid || !isValidObjectId(bid)) {
      throw ApiError.badRequest('Invalid cursor');
    }
    filter._id = { $lt: new Types.ObjectId(bid) };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 50);

  // Fetch limit + 1 so we can compute hasMore without a second count query.
  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(safeLimit + 1)
    .populate({ path: 'sender', select: SENDER_PROJECTION });

  const hasMore = docs.length > safeLimit;
  const sliced = hasMore ? docs.slice(0, safeLimit) : docs;
  const nextCursor = hasMore ? sliced[sliced.length - 1]._id.toString() : null;

  // Reverse so the array is in chronological (asc) order — easier for the
  // client to render without per-row gymnastics.
  const items = sliced.reverse();

  return { items, hasMore, nextCursor };
};

/**
 * Edit the text body of a message. Authorization rules live in
 * `assertCanModifyMessage` — this function only orchestrates: load → check
 * → mutate → repopulate.
 */
export const editMessage = async ({ messageId, actor, text }) => {
  const mid = toIdString(messageId);
  if (!mid || !isValidObjectId(mid)) {
    throw ApiError.badRequest('Invalid message id');
  }

  const message = await Message.findById(mid);
  if (!message) throw ApiError.notFound('Message not found');

  // Participant gate first — non-participants can't even probe message ids.
  const conversation = await Conversation.findById(message.conversationId).select(
    'participants',
  );
  assertParticipant(conversation, actor?._id);

  assertCanModifyMessage(message, actor, { action: 'edit' });

  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length === 0) {
    throw ApiError.badRequest('Text message cannot be empty');
  }
  if (trimmed.length > MESSAGE_TEXT_MAX_LENGTH) {
    throw ApiError.badRequest(
      `Text message must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
    );
  }

  message.text = trimmed;
  message.editedAt = new Date();
  await message.save();

  return message.populate({ path: 'sender', select: SENDER_PROJECTION });
};

/**
 * Delete a message either for the requester only ('self') or for every
 * participant ('everyone'). Cloudinary cleanup is intentionally NOT done
 * here — the upload controller (STEP 8) owns that concern; the service
 * just exposes `imagePublicId` on the returned doc so the caller (or
 * socket handler) can trigger a destroy.
 */
export const deleteMessage = async ({ messageId, actor, scope }) => {
  if (scope !== 'self' && scope !== 'everyone') {
    throw ApiError.badRequest("scope must be 'self' or 'everyone'");
  }
  const mid = toIdString(messageId);
  if (!mid || !isValidObjectId(mid)) {
    throw ApiError.badRequest('Invalid message id');
  }

  const message = await Message.findById(mid);
  if (!message) throw ApiError.notFound('Message not found');

  const conversation = await Conversation.findById(message.conversationId).select(
    'participants',
  );
  assertParticipant(conversation, actor?._id);

  if (scope === 'self') {
    assertCanModifyMessage(message, actor, { action: 'deleteForSelf' });
    const actorId = toIdString(actor._id);
    const already = (message.hiddenFor || []).some(
      (id) => toIdString(id) === actorId,
    );
    if (!already) {
      message.hiddenFor.push(new Types.ObjectId(actorId));
      await message.save();
    }
    return { scope: 'self', message };
  }

  assertCanModifyMessage(message, actor, { action: 'deleteForEveryone' });
  const previousImagePublicId = message.imagePublicId || '';
  message.deletedFor = MESSAGE_DELETED_FOR.EVERYONE;
  // Pre-save hook clears text/imageUrl; clear the stored cloudinary id too
  // so subsequent reads can't replay it.
  message.imagePublicId = '';
  await message.save();

  return {
    scope: 'everyone',
    message: await message.populate({ path: 'sender', select: SENDER_PROJECTION }),
    // Surface to the caller so it can fire-and-forget a Cloudinary destroy.
    imagePublicId: previousImagePublicId,
  };
};

/**
 * Toggle / replace a single user's reaction on a message. Rules:
 *  - Same emoji as existing → remove (toggle off).
 *  - Different emoji → replace (one reaction per user per message).
 *  - No previous reaction → add.
 *
 * Implemented atomically as one updateOne with array filters where
 * possible, but since we need to branch on the existing entry we read
 * → mutate → save with the model's pre-save dedupe acting as belt + braces.
 */
export const toggleReaction = async ({ messageId, actor, emoji }) => {
  const mid = toIdString(messageId);
  if (!mid || !isValidObjectId(mid)) {
    throw ApiError.badRequest('Invalid message id');
  }
  const trimmed = typeof emoji === 'string' ? emoji.trim() : '';
  if (trimmed.length === 0) {
    throw ApiError.badRequest('emoji is required');
  }
  if ([...trimmed].length > REACTION_EMOJI_MAX_LENGTH) {
    throw ApiError.badRequest(
      `emoji must be at most ${REACTION_EMOJI_MAX_LENGTH} characters`,
    );
  }

  const message = await Message.findById(mid);
  if (!message) throw ApiError.notFound('Message not found');
  if (message.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    throw ApiError.badRequest('Cannot react to a deleted message');
  }

  const conversation = await Conversation.findById(message.conversationId).select(
    'participants',
  );
  assertParticipant(conversation, actor?._id);

  const actorId = toIdString(actor._id);
  const existingIdx = message.reactions.findIndex(
    (r) => toIdString(r.user) === actorId,
  );

  let action;
  if (existingIdx === -1) {
    message.reactions.push({ user: new Types.ObjectId(actorId), emoji: trimmed });
    action = 'added';
  } else if (message.reactions[existingIdx].emoji === trimmed) {
    message.reactions.splice(existingIdx, 1);
    action = 'removed';
  } else {
    message.reactions[existingIdx].emoji = trimmed;
    action = 'replaced';
  }

  await message.save();
  await message.populate({ path: 'sender', select: SENDER_PROJECTION });

  return { action, message };
};

/**
 * In-conversation full-text-ish search. We never pass raw user input to
 * `$regex` — `escapeRegex` neutralizes metacharacters that could trigger
 * catastrophic backtracking (ReDoS). `i` makes the search case-insensitive
 * which is what users expect from chat search.
 */
export const searchMessages = async ({
  conversationId,
  userId,
  q,
  limit = 30,
}) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const term = typeof q === 'string' ? q.trim() : '';
  if (term.length < 2 || term.length > 100) {
    throw ApiError.badRequest('Search term must be 2–100 characters');
  }

  const conversation = await Conversation.findById(cid).select('participants');
  assertParticipant(conversation, uid);

  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 50);
  const safe = escapeRegex(term);

  const items = await Message.find({
    conversationId: cid,
    type: MESSAGE_TYPES.TEXT,
    text: { $regex: safe, $options: 'i' },
    deletedFor: { $ne: MESSAGE_DELETED_FOR.EVERYONE },
    hiddenFor: { $ne: new Types.ObjectId(uid) },
  })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate({ path: 'sender', select: SENDER_PROJECTION });

  return { items, total: items.length };
};

export const _internals = {
  toIdString,
  isValidObjectId,
  isAllowedCloudinaryUrl,
  buildLastMessageSnapshotFields: SENDER_PROJECTION,
};
