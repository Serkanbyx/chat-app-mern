import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { isProduction } from '../config/env.js';
import {
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  USER_STATUS,
} from '../utils/constants.js';
import {
  createMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markConversationAsRead,
} from '../utils/messageService.js';
import { safeDestroy } from '../config/cloudinary.js';
import {
  serializeMessage,
  serializeNotification,
  serializePublicUser,
} from '../utils/serializers.js';
import { persistMessageNotification } from '../utils/notificationService.js';
import { convRoom, userRoom } from './rooms.js';
import {
  addActiveViewer,
  removeActiveViewer,
  isUserActiveInConversation,
} from './activeConversations.js';

const { Types } = mongoose;

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{24}$/i.test(value) &&
  Types.ObjectId.isValid(value);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Strict payload-shape gate. Drops any unexpected key BEFORE the data
 * leaves the socket layer — defence-in-depth against mass-assignment
 * style attacks (a malicious client tacking on `sender: <other-user>`
 * or `_id: <existing-message>` and hoping a layer downstream forwards
 * it untouched).
 */
const pickAllowedKeys = (payload, allowed) => {
  if (!isPlainObject(payload)) return null;
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      out[key] = payload[key];
    }
  }
  return out;
};

/**
 * Build an ack-wrapper that:
 *   - Coerces a missing/non-function ack into a no-op so a forgetful
 *     client cannot crash the handler.
 *   - Logs unhandled handler errors in non-prod for diagnostics.
 *   - Always sends the client a generic `{ success: false, message }`
 *     so error shapes remain stable across handlers.
 */
const withAck = (rawAck, label) => {
  const ack = typeof rawAck === 'function' ? rawAck : () => {};
  return {
    success: (data) => ack({ success: true, ...data }),
    failure: (message, err) => {
      if (!isProduction && err) {
        console.warn(`[socket:${label}]`, err?.message || err);
      }
      ack({ success: false, message });
    },
  };
};

/**
 * Re-read the actor's `status` straight from the DB before any
 * persistence side-effect. The socket cache is set at handshake time and
 * could be minutes old; suspending a user via the admin panel must take
 * effect on their NEXT message attempt, not at the next reconnect.
 */
const assertActorActive = async (userId) => {
  const fresh = await User.findById(userId).select('status').lean();
  return fresh?.status === USER_STATUS.ACTIVE;
};

/**
 * Pull the recipient list (everyone but the sender) and the sender's
 * public profile in a single shaped query. Returns `{ recipientIds,
 * fromUser, conversation }` where any field can be `null` if the doc was
 * deleted under us — caller is expected to handle the empty case.
 */
const loadConversationContext = async (conversationId, senderId) => {
  const [conversation, fromUser] = await Promise.all([
    Conversation.findById(conversationId).select('participants type'),
    User.findById(senderId).select('username displayName avatarUrl').lean(),
  ]);
  if (!conversation) return { conversation: null, recipientIds: [], fromUser: null };
  const recipientIds = (conversation.participants || [])
    .map((p) => String(p))
    .filter((id) => id !== String(senderId));
  return { conversation, recipientIds, fromUser };
};

/**
 * Notification fan-out for `message:new`. Per spec:
 *   - Recipient must NOT have the chat window currently open (focus
 *     refcount === 0 — see `activeConversations.js`).
 *   - Recipient must NOT have muted the conversation.
 *
 * One DB query batches the mute lookup so the cost is O(1) round-trips
 * regardless of group size. Each surviving recipient also gets a
 * persisted `Notification` row (with 30s collapse) so the inbox view
 * survives reloads — see `persistMessageNotification`.
 */
const emitNotifications = async ({
  io,
  conversationId,
  recipientIds,
  message,
  fromUser,
}) => {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;

  // Pre-filter out anyone currently focused on the conversation. Avoids
  // touching the DB for users we're definitely not notifying.
  const candidateIds = recipientIds.filter(
    (id) => !isUserActiveInConversation(conversationId, id),
  );
  if (candidateIds.length === 0) return;

  const mutedRows = await User.find(
    {
      _id: { $in: candidateIds },
      mutedConversations: new Types.ObjectId(String(conversationId)),
    },
    { _id: 1 },
  ).lean();
  const mutedSet = new Set(mutedRows.map((u) => String(u._id)));

  const senderIdString = message?.sender?._id ? String(message.sender._id) : null;
  const messageIdString = message?._id ? String(message._id) : null;
  const fromUserWire = serializePublicUser(fromUser);

  // Persist + emit per recipient. Done in parallel so a slow Mongo
  // response for one recipient does not delay another's live event.
  await Promise.all(
    candidateIds.map(async (recipientId) => {
      if (mutedSet.has(recipientId)) return;

      let notificationWire = null;
      try {
        const persisted = await persistMessageNotification({
          recipientId,
          conversationId,
          messageId: messageIdString,
          actorId: senderIdString,
          message,
          fromUser,
        });
        notificationWire = serializeNotification(persisted);
      } catch (err) {
        // Persistence failure must NOT block the live notification —
        // the client still gets the toast/sound, only the inbox row is
        // missing. Log in non-prod for diagnostics.
        if (!isProduction) {
          console.warn('[emitNotifications] persist failed:', err?.message || err);
        }
      }

      io.to(userRoom(recipientId)).emit('notification:new', {
        conversationId: String(conversationId),
        message,
        fromUser: fromUserWire,
        notification: notificationWire,
      });
    }),
  );
};

/* ---------- Broadcaster helpers ---------- */
/* Exported so REST controllers (message.controller.js, conversation.controller.js)
 * can reuse the exact same fan-out logic. The socket handlers below pass
 * `excludeSocketId` to suppress double-rendering on the originating tab;
 * REST callers omit it. */

/**
 * Emit `message:new` to every socket in the conversation room (excluding
 * the originating socket if any) and trigger the notification fan-out.
 *
 * `message` may be a Mongoose doc OR a pre-serialized object — we always
 * pass it through `serializeMessage` so `hiddenFor` is stripped no matter
 * what the caller had on hand.
 */
export const broadcastNewMessage = async (
  io,
  { message, conversation = null, fromUser = null, excludeSocketId = null },
) => {
  if (!io || !message) return;
  const conversationId = String(message.conversationId);
  const wire = serializeMessage(message);

  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('message:new', wire);

  // Resolve sender + recipient ids if the caller didn't already have
  // them. System messages (sender === null) skip the notification path.
  const senderId = wire?.sender?._id ? String(wire.sender._id) : null;
  if (!senderId) return;

  let ctx = { conversation, recipientIds: null, fromUser };
  if (!conversation || !fromUser) {
    ctx = await loadConversationContext(conversationId, senderId);
  } else {
    ctx.recipientIds = (conversation.participants || [])
      .map((p) => String(p))
      .filter((id) => id !== senderId);
  }

  if (!ctx.recipientIds || ctx.recipientIds.length === 0) return;

  await emitNotifications({
    io,
    conversationId,
    recipientIds: ctx.recipientIds,
    message: wire,
    fromUser: ctx.fromUser,
  });
};

export const broadcastEditedMessage = (io, { message, excludeSocketId = null }) => {
  if (!io || !message) return;
  const conversationId = String(message.conversationId);
  const wire = serializeMessage(message);
  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('message:edited', wire);
};

/**
 * Emit `message:deleted` for either scope:
 *   - 'everyone' → fan out to the whole conversation room so every UI
 *                  redacts the bubble.
 *   - 'self'     → fan out ONLY to the requester's user room (their
 *                  other devices need to drop the bubble too); do NOT
 *                  reach the rest of the conversation.
 */
export const broadcastDeletedMessage = (
  io,
  { conversationId, messageId, scope, actorUserId = null, excludeSocketId = null },
) => {
  if (!io || !conversationId || !messageId) return;

  const payload = {
    conversationId: String(conversationId),
    messageId: String(messageId),
    for: scope,
  };

  if (scope === 'self') {
    if (!actorUserId) return;
    const target = excludeSocketId
      ? io.to(userRoom(actorUserId)).except(excludeSocketId)
      : io.to(userRoom(actorUserId));
    target.emit('message:deleted', payload);
    return;
  }

  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('message:deleted', payload);
};

export const broadcastReactionUpdated = (
  io,
  { message, excludeSocketId = null },
) => {
  if (!io || !message) return;
  const conversationId = String(message.conversationId);
  io.to(convRoom(conversationId))
    .except(excludeSocketId || [])
    .emit('message:reactionUpdated', {
      messageId: String(message._id),
      conversationId,
      reactions: message.reactions || [],
    });
};

/**
 * Emit `conversation:readBy` to other participants so their bubbles
 * upgrade to the double-tick state. Privacy gate: callers MUST resolve
 * `showReadReceipts` BEFORE invoking — this helper just fans out.
 */
export const broadcastReadReceipt = (
  io,
  { conversationId, userId, readAt, excludeSocketId = null },
) => {
  if (!io || !conversationId || !userId) return;
  const payload = {
    conversationId: String(conversationId),
    userId: String(userId),
    readAt: typeof readAt === 'string' ? readAt : new Date(readAt).toISOString(),
  };
  const target = excludeSocketId
    ? io.to(convRoom(conversationId)).except(excludeSocketId)
    : io.to(convRoom(conversationId));
  target.emit('conversation:readBy', payload);
};

/* ---------- Per-socket event handlers ---------- */

const SEND_KEYS = [
  'conversationId',
  'type',
  'text',
  'imageUrl',
  'imagePublicId',
  'replyTo',
  'clientTempId',
];
const EDIT_KEYS = ['messageId', 'text'];
const DELETE_KEYS = ['messageId', 'for'];
const REACTION_KEYS = ['messageId', 'emoji'];
const CONV_ID_KEYS = ['conversationId'];

export const registerMessageHandlers = (io, socket) => {
  const userId = String(socket.user._id);

  /**
   * `message:send` — primary write path. Persists, broadcasts, and
   * triggers notifications. Returns the persisted message + clientTempId
   * via ack so the originating tab can reconcile its optimistic bubble.
   */
  socket.on('message:send', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:send');
    try {
      const payload = pickAllowedKeys(raw, SEND_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.conversationId)) {
        return ack.failure('Invalid conversation id');
      }

      const clientTempId =
        typeof payload.clientTempId === 'string' && payload.clientTempId.length <= 64
          ? payload.clientTempId
          : null;

      // Re-check status from DB, NOT from the cached `socket.user`.
      // Suspending a user must close their write surface immediately,
      // even if their socket is still connected.
      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const persisted = await createMessage({
        conversationId: payload.conversationId,
        senderId: userId,
        type: payload.type,
        text: payload.text,
        imageUrl: payload.imageUrl,
        imagePublicId: payload.imagePublicId,
        replyTo: payload.replyTo ?? null,
      });

      // Other-device fan-out + notification dispatch. Sender's originating
      // socket is excluded — it gets the persisted message via the ack.
      await broadcastNewMessage(io, {
        message: persisted,
        excludeSocketId: socket.id,
      });

      const wire = serializeMessage(
        persisted,
        clientTempId ? { clientTempId } : null,
      );
      return ack.success({ message: wire });
    } catch (err) {
      // Service-layer ApiError messages are safe to surface (they're
      // user-facing strings like "You have blocked this user"). Anything
      // else collapses to a generic failure.
      const message = err?.statusCode ? err.message : 'Failed to send message';
      return ack.failure(message, err);
    }
  });

  /**
   * `message:edit` — text-only, sender-only, within the edit window.
   * Authorisation rules live in `assertCanModifyMessage` (service).
   */
  socket.on('message:edit', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:edit');
    try {
      const payload = pickAllowedKeys(raw, EDIT_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.messageId)) {
        return ack.failure('Invalid message id');
      }

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const updated = await editMessage({
        messageId: payload.messageId,
        actor: socket.user,
        text: payload.text,
      });

      broadcastEditedMessage(io, {
        message: updated,
        excludeSocketId: socket.id,
      });

      return ack.success({ message: serializeMessage(updated) });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to edit message';
      return ack.failure(message, err);
    }
  });

  /**
   * `message:delete` — 'self' (per-user tombstone) or 'everyone'
   * (sender-only redaction within the delete window, or admin override).
   * Cloudinary cleanup for image messages is fire-and-forget so the ack
   * is not blocked on a third-party round-trip.
   */
  socket.on('message:delete', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:delete');
    try {
      const payload = pickAllowedKeys(raw, DELETE_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.messageId)) {
        return ack.failure('Invalid message id');
      }
      if (payload.for !== 'self' && payload.for !== 'everyone') {
        return ack.failure("'for' must be 'self' or 'everyone'");
      }

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const result = await deleteMessage({
        messageId: payload.messageId,
        actor: socket.user,
        scope: payload.for,
      });

      const conversationId = String(result.message.conversationId);

      broadcastDeletedMessage(io, {
        conversationId,
        messageId: payload.messageId,
        scope: result.scope,
        actorUserId: userId,
        excludeSocketId: socket.id,
      });

      if (result.scope === 'everyone' && result.imagePublicId) {
        safeDestroy(result.imagePublicId);
      }

      return ack.success({
        messageId: String(payload.messageId),
        conversationId,
        for: result.scope,
      });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to delete message';
      return ack.failure(message, err);
    }
  });

  /**
   * `message:reaction` — toggle / replace a single user's reaction on a
   * message. Service enforces the "one reaction per user" rule.
   */
  socket.on('message:reaction', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'message:reaction');
    try {
      const payload = pickAllowedKeys(raw, REACTION_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.messageId)) {
        return ack.failure('Invalid message id');
      }
      if (typeof payload.emoji !== 'string' || payload.emoji.trim().length === 0) {
        return ack.failure('emoji is required');
      }

      if (!(await assertActorActive(userId))) {
        return ack.failure('Account is not active');
      }

      const { action, message } = await toggleReaction({
        messageId: payload.messageId,
        actor: socket.user,
        emoji: payload.emoji,
      });

      broadcastReactionUpdated(io, { message, excludeSocketId: socket.id });

      return ack.success({
        action,
        messageId: String(message._id),
        conversationId: String(message.conversationId),
        reactions: message.reactions,
      });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to react to message';
      return ack.failure(message, err);
    }
  });

  /**
   * `conversation:read` — mark every unread in the conversation as read
   * and (optionally, gated by the user's `showReadReceipts` preference)
   * broadcast `conversation:readBy` so the other participants upgrade
   * their tick. Always invokes the service even when broadcasts are
   * suppressed so the user's own unread counter still resets.
   */
  socket.on('conversation:read', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'conversation:read');
    try {
      const payload = pickAllowedKeys(raw, CONV_ID_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.conversationId)) {
        return ack.failure('Invalid conversation id');
      }

      await markConversationAsRead({
        conversationId: payload.conversationId,
        userId,
      });

      // Re-read the privacy preference (toggle-friendly): a user that
      // disabled receipts mid-session must immediately stop emitting.
      const fresh = await User.findById(userId)
        .select('preferences.showReadReceipts')
        .lean();
      const allowsBroadcast = fresh?.preferences?.showReadReceipts !== false;
      const readAt = new Date().toISOString();

      if (allowsBroadcast) {
        broadcastReadReceipt(io, {
          conversationId: payload.conversationId,
          userId,
          readAt,
          excludeSocketId: socket.id,
        });
      }

      return ack.success({
        conversationId: String(payload.conversationId),
        readAt,
        broadcast: allowsBroadcast,
      });
    } catch (err) {
      const message = err?.statusCode ? err.message : 'Failed to mark as read';
      return ack.failure(message, err);
    }
  });

  /**
   * `conversation:open` — client announces that the chat window is now
   * focused on `conversationId`. Suppresses `notification:new` for new
   * messages in this conversation while at least one of the user's
   * sockets is open on it. Implicitly closes the previously-open one.
   */
  socket.on('conversation:open', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'conversation:open');
    try {
      const payload = pickAllowedKeys(raw, CONV_ID_KEYS);
      if (!payload) return ack.failure('Invalid payload');
      if (!isValidObjectId(payload.conversationId)) {
        return ack.failure('Invalid conversation id');
      }

      // Cheap participant gate so a malicious client can't suppress its
      // own notifications for foreign conversations.
      const conversation = await Conversation.findOne(
        { _id: payload.conversationId, participants: userId, isActive: true },
        '_id',
      ).lean();
      if (!conversation) return ack.failure('Conversation not found');

      // Replace any previous focus so refcounts stay balanced even if
      // the client forgot to send `conversation:close` first.
      const previous = socket.data.activeConversationId;
      if (previous && previous !== payload.conversationId) {
        removeActiveViewer(previous, userId);
      }

      socket.data.activeConversationId = payload.conversationId;
      addActiveViewer(payload.conversationId, userId);

      return ack.success({ conversationId: String(payload.conversationId) });
    } catch (err) {
      return ack.failure('Failed to open conversation', err);
    }
  });

  /**
   * `conversation:close` — client lost focus / closed the chat window.
   * Idempotent: closing when nothing is open is a no-op rather than an
   * error, since browser focus events can be noisy.
   */
  socket.on('conversation:close', async (raw, rawAck) => {
    const ack = withAck(rawAck, 'conversation:close');
    try {
      const payload = pickAllowedKeys(raw, CONV_ID_KEYS);
      const targetId = payload?.conversationId;
      const active = socket.data.activeConversationId;

      // Allow a bare `conversation:close` (no payload) to clear whatever
      // was active. Mirrors how blur/visibility events fire on the client.
      if (!targetId) {
        if (active) {
          removeActiveViewer(active, userId);
          socket.data.activeConversationId = null;
        }
        return ack.success({});
      }

      if (!isValidObjectId(targetId)) {
        return ack.failure('Invalid conversation id');
      }

      if (active === targetId) {
        removeActiveViewer(active, userId);
        socket.data.activeConversationId = null;
      }
      return ack.success({});
    } catch (err) {
      return ack.failure('Failed to close conversation', err);
    }
  });
};

export default registerMessageHandlers;

// Exposed for test ergonomics; not part of the public socket surface.
export const _internals = {
  pickAllowedKeys,
  isValidObjectId,
  emitNotifications,
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  CONVERSATION_TYPES,
};
