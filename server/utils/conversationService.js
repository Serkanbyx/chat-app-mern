import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { ApiError } from './apiError.js';
import { CONVERSATION_TYPES } from './constants.js';

const { Types } = mongoose;

/**
 * Coerce any input (string | ObjectId | populated doc) into a hex string
 * for consistent comparisons. Returns `null` if it cannot be coerced.
 */
const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value._id) return value._id.toString();
  return null;
};

const isValidObjectId = (value) =>
  typeof value === 'string' && Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value);

/**
 * Idempotently fetch (or create) the unique 1-on-1 conversation between two
 * users. Sorting the id pair guarantees a deterministic key so two parallel
 * requests can't create two distinct rows for the same pair.
 */
export const findOrCreateDirectConversation = async (userAId, userBId) => {
  const a = toIdString(userAId);
  const b = toIdString(userBId);

  if (!a || !b) throw ApiError.badRequest('Invalid user id');
  if (a === b) throw ApiError.badRequest('Cannot create a direct conversation with yourself');
  if (!isValidObjectId(a) || !isValidObjectId(b)) {
    throw ApiError.badRequest('Invalid user id');
  }

  // $all + $size guarantees we match the exact pair regardless of stored order.
  const existing = await Conversation.findOne({
    type: CONVERSATION_TYPES.DIRECT,
    participants: { $all: [a, b], $size: 2 },
  });
  if (existing) return existing;

  // Sort to keep stored order deterministic — useful for debugging and tests.
  const [first, second] = [a, b].sort();

  try {
    const created = await Conversation.create({
      type: CONVERSATION_TYPES.DIRECT,
      participants: [first, second],
      createdBy: first,
    });
    return created;
  } catch (err) {
    // Lost a race with a concurrent create — re-read instead of failing.
    if (err?.code === 11000) {
      const racedWinner = await Conversation.findOne({
        type: CONVERSATION_TYPES.DIRECT,
        participants: { $all: [a, b], $size: 2 },
      });
      if (racedWinner) return racedWinner;
    }
    throw err;
  }
};

/**
 * Authorization gate: the participants array is the single source of truth
 * for who can read or mutate a conversation. Call this BEFORE any read.
 */
export const assertParticipant = (conversation, userId) => {
  if (!conversation) throw ApiError.notFound('Conversation not found');
  const uid = toIdString(userId);
  if (!uid) throw ApiError.unauthorized('Unauthenticated');

  const isMember = conversation.participants.some(
    (p) => toIdString(p) === uid,
  );
  if (!isMember) throw ApiError.forbidden('You are not a participant of this conversation');
};

/**
 * Authorization gate for group-admin-only operations (rename, add member,
 * promote, etc.). No-op for direct conversations because they have no admins.
 */
export const assertGroupAdmin = (conversation, userId) => {
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (conversation.type !== CONVERSATION_TYPES.GROUP) return;

  const uid = toIdString(userId);
  if (!uid) throw ApiError.unauthorized('Unauthenticated');

  const isAdmin = conversation.admins.some((a) => toIdString(a) === uid);
  if (!isAdmin) throw ApiError.forbidden('Admin privileges required');
};

/**
 * Bump unread counters for everyone except the sender. Map keys are
 * validated as 24-char hex ObjectIds before reaching `$inc` to block
 * NoSQL field traversal / prototype-pollution-shaped attacks.
 *
 * Returns the updated document (or `null` if not found).
 */
export const incrementUnread = async (conversationId, recipientIds) => {
  const cid = toIdString(conversationId);
  if (!cid || !isValidObjectId(cid)) throw ApiError.badRequest('Invalid conversation id');
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return null;

  const inc = {};
  for (const rid of recipientIds) {
    const id = toIdString(rid);
    if (!id || !isValidObjectId(id)) continue;
    inc[`unreadCounts.${id}`] = 1;
  }
  if (Object.keys(inc).length === 0) return null;

  return Conversation.findByIdAndUpdate(
    cid,
    { $inc: inc },
    { new: true },
  );
};

/**
 * Reset a single user's unread counter to zero. Used when the user opens or
 * scrolls to the bottom of the conversation.
 */
export const resetUnread = async (conversationId, userId) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);
  if (!cid || !isValidObjectId(cid)) throw ApiError.badRequest('Invalid conversation id');
  if (!uid || !isValidObjectId(uid)) throw ApiError.badRequest('Invalid user id');

  return Conversation.findByIdAndUpdate(
    cid,
    { $set: { [`unreadCounts.${uid}`]: 0 } },
    { new: true },
  );
};

/**
 * Detach a user from every conversation they belong to while preserving
 * the schema invariants the naive `$pull` cannot:
 *   - Direct chats (and any group that drops below 2 members) are
 *     tombstoned (`isActive: false`) instead of being left structurally
 *     invalid — a 1-participant active group throws on the next `.save()`.
 *   - A group that loses its last admin promotes its earliest-joined
 *     remaining participant so it never becomes admin-less.
 *
 * Used by the self-delete (auth) and admin hard-delete cascades. Runs one
 * targeted `updateOne` per affected conversation so each row gets the
 * correct branch — bulk `updateMany` cannot express the per-row logic.
 */
export const detachUserFromConversations = async (userId) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) return;

  const conversations = await Conversation.find({ participants: uid }).select(
    'participants admins type',
  );

  await Promise.all(
    conversations.map((conv) => {
      const remaining = conv.participants
        .map((p) => String(p))
        .filter((id) => id !== uid);

      const update = {
        $pull: { participants: uid, admins: uid },
        $unset: { [`unreadCounts.${uid}`]: '' },
      };

      if (remaining.length < 2) {
        // Direct chat, or a group that would drop below the 2-member
        // minimum — close it rather than leave an invalid document.
        update.$set = { isActive: false };
      } else if (conv.type === CONVERSATION_TYPES.GROUP) {
        const remainingAdmins = conv.admins
          .map((a) => String(a))
          .filter((id) => id !== uid && remaining.includes(id));
        if (remainingAdmins.length === 0) {
          // Promote the earliest-joined remaining participant.
          update.$addToSet = { admins: remaining[0] };
        }
      }

      return Conversation.updateOne({ _id: conv._id }, update);
    }),
  );
};

/**
 * Internal helpers exported for test ergonomics. Not part of the public
 * surface — feature controllers should not need these directly.
 */
export const _internals = { toIdString, isValidObjectId };
