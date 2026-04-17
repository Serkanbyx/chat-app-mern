import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { ApiError } from './apiError.js';
import { assertParticipant, resetUnread } from './conversationService.js';
import { env } from '../config/env.js';
import {
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  MESSAGE_TEXT_MAX_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS,
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

export const _internals = {
  toIdString,
  isValidObjectId,
  isAllowedCloudinaryUrl,
  buildLastMessageSnapshotFields: SENDER_PROJECTION,
};
