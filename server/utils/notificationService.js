import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { ApiError } from './apiError.js';
import {
  MESSAGE_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_TEXT_MAX_LENGTH,
  NOTIFICATION_COLLAPSE_WINDOW_MS,
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
 * Strip control chars + the four "structural" HTML chars and collapse
 * whitespace. Defence-in-depth for any segment that originated from a
 * user-controlled value (display name, message preview) before we paste
 * it into a server-built template string.
 *
 * Mirrors `sanitizePlainSegment` in messageService.js intentionally — we
 * keep one sanitizer per file so each layer owns its own boundary
 * instead of cross-importing.
 */
const sanitizePlainSegment = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>&"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
};

const truncate = (value, max = NOTIFICATION_TEXT_MAX_LENGTH) => {
  if (typeof value !== 'string') return '';
  if (value.length <= max) return value;
  // Reserve one char for the ellipsis so the final length is exactly
  // `max` — keeps the schema validator happy in pathological cases.
  return `${value.slice(0, Math.max(0, max - 1))}…`;
};

/**
 * Build the wire/text payload for a `message`-type notification.
 *
 *   - Direct chat   → "{actor}: {preview}"
 *   - Group chat    → "{actor}: {preview}"  (group context lives in the
 *                     conversationId — no need to embed group name in
 *                     the preview, the client already renders the chat
 *                     title alongside the avatar).
 *   - Image message → "{actor} sent a photo"
 *   - System message→ falls back to the system text directly (this path
 *                     is unreachable today — system messages have
 *                     `sender: null` and skip the notification fan-out
 *                     — but we keep it defined for future safety).
 */
export const buildMessageNotificationText = ({ message, fromUser }) => {
  const actor = sanitizePlainSegment(
    fromUser?.displayName || fromUser?.username || '',
    'Someone',
  );

  const type = message?.type;

  if (type === MESSAGE_TYPES.IMAGE) {
    return truncate(`${actor} sent a photo`);
  }

  if (type === MESSAGE_TYPES.SYSTEM) {
    return truncate(sanitizePlainSegment(message?.text || '', actor));
  }

  const preview = sanitizePlainSegment(message?.text || '', '');
  if (!preview) return truncate(`${actor} sent a message`);
  return truncate(`${actor}: ${preview}`);
};

/**
 * Persist a `message`-type notification with collapse:
 *   - If an UNREAD `message` notification exists for this recipient +
 *     conversation within `NOTIFICATION_COLLAPSE_WINDOW_MS`, update its
 *     `text`, `messageId`, `actor`, and bump `createdAt` so it floats
 *     to the top of the inbox. ONE row per burst, not N.
 *   - Otherwise, create a new row.
 *
 * Reading the latest unread row first (instead of trying an
 * upsert-with-conditions) keeps the logic readable and lets us bump
 * `createdAt` via a `$set` — `findOneAndUpdate` with `upsert: true`
 * cannot atomically distinguish "create new" from "update existing
 * within window" without a transaction, and the collapse window is
 * already best-effort.
 */
export const persistMessageNotification = async ({
  recipientId,
  conversationId,
  messageId,
  actorId,
  message,
  fromUser,
}) => {
  const rid = toIdString(recipientId);
  const cid = toIdString(conversationId);
  const mid = toIdString(messageId);
  const aid = toIdString(actorId);

  if (!rid || !isValidObjectId(rid)) return null;
  if (!cid || !isValidObjectId(cid)) return null;
  if (!mid || !isValidObjectId(mid)) return null;

  const text = buildMessageNotificationText({ message, fromUser });
  if (!text) return null;

  const cutoff = new Date(Date.now() - NOTIFICATION_COLLAPSE_WINDOW_MS);

  // Look for the most recent unread message-notification for this
  // (recipient, conversation) pair INSIDE the collapse window.
  const existing = await Notification.findOne({
    recipient: rid,
    conversationId: cid,
    type: NOTIFICATION_TYPES.MESSAGE,
    isRead: false,
    createdAt: { $gte: cutoff },
  })
    .sort({ createdAt: -1 })
    .select('_id');

  if (existing) {
    const updated = await Notification.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          text,
          messageId: new Types.ObjectId(mid),
          actor: aid ? new Types.ObjectId(aid) : null,
          createdAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    return updated;
  }

  const created = await Notification.create({
    recipient: rid,
    type: NOTIFICATION_TYPES.MESSAGE,
    conversationId: cid,
    messageId: mid,
    actor: aid || null,
    text,
  });
  return created.toObject();
};

/**
 * Paginated inbox listing. Always filtered by `recipient` — there is no
 * supported path to read another user's notifications.
 */
export const listNotifications = async ({ userId, page = 1, limit = 20 }) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = (safePage - 1) * safeLimit;

  const filter = { recipient: uid };

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({ path: 'actor', select: '_id username displayName avatarUrl' })
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: uid, isRead: false }),
  ]);

  return { items, total, unreadCount, page: safePage, limit: safeLimit };
};

/**
 * Mark a single notification as read. Ownership is enforced inside the
 * filter — no separate "find then check" round-trip — so attempting to
 * read someone else's row returns 404, never 403 (we don't want to leak
 * the existence of foreign rows).
 */
export const markNotificationRead = async ({ notificationId, userId }) => {
  const nid = toIdString(notificationId);
  const uid = toIdString(userId);

  if (!nid || !isValidObjectId(nid)) {
    throw ApiError.badRequest('Invalid notification id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const updated = await Notification.findOneAndUpdate(
    { _id: nid, recipient: uid },
    { $set: { isRead: true } },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('Notification not found');
  return updated;
};

/** Bulk mark — only touches the caller's unread rows. */
export const markAllNotificationsRead = async ({ userId }) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const result = await Notification.updateMany(
    { recipient: uid, isRead: false },
    { $set: { isRead: true } },
  );

  return { modified: result.modifiedCount ?? 0 };
};

/**
 * Hard-delete a notification. Same ownership-via-filter trick as the
 * read endpoint to avoid foreign-row enumeration.
 */
export const deleteNotification = async ({ notificationId, userId }) => {
  const nid = toIdString(notificationId);
  const uid = toIdString(userId);

  if (!nid || !isValidObjectId(nid)) {
    throw ApiError.badRequest('Invalid notification id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const deleted = await Notification.findOneAndDelete({
    _id: nid,
    recipient: uid,
  }).lean();

  if (!deleted) throw ApiError.notFound('Notification not found');
  return { id: nid };
};

/** Cheap badge query for the navbar. Hits the compound index. */
export const getUnreadNotificationCount = async ({ userId }) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const count = await Notification.countDocuments({
    recipient: uid,
    isRead: false,
  });
  return count;
};

export const _internals = {
  toIdString,
  isValidObjectId,
  sanitizePlainSegment,
  truncate,
};
