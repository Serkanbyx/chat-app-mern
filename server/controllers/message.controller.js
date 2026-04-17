import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createMessage,
  listMessages,
  editMessage,
  deleteMessage,
  toggleReaction,
  searchMessages,
} from '../utils/messageService.js';
import { MESSAGE_TYPES } from '../utils/constants.js';
import { safeDestroy } from '../config/cloudinary.js';
import { serializeMessage } from '../utils/serializers.js';
import {
  broadcastNewMessage,
  broadcastEditedMessage,
  broadcastDeletedMessage,
  broadcastReactionUpdated,
} from '../sockets/message.socket.js';

// GET /api/conversations/:id/messages
export const getMessages = asyncHandler(async (req, res) => {
  const { before, limit } = req.query;

  const { items, hasMore, nextCursor } = await listMessages({
    conversationId: req.params.id,
    userId: req.user._id,
    before: before || null,
    limit: limit ?? 30,
  });

  res.status(200).json({
    success: true,
    data: {
      items: items.map(serializeMessage),
      hasMore,
      nextCursor,
    },
  });
});

// POST /api/conversations/:id/messages
export const sendMessage = asyncHandler(async (req, res) => {
  const {
    type = MESSAGE_TYPES.TEXT,
    text = '',
    imageUrl = '',
    imagePublicId = '',
    replyTo = null,
  } = req.body;

  const message = await createMessage({
    conversationId: req.params.id,
    senderId: req.user._id,
    type,
    text,
    imageUrl,
    imagePublicId,
    replyTo,
  });

  // Fan out to every device in the conversation room AND trigger the
  // notification dispatch for offline / unfocused recipients. REST has
  // no originating socket id, so we cannot exclude one — the calling
  // device will receive the same payload via WebSocket and is expected
  // to dedupe by `_id` (matches the optimistic-UI contract).
  const io = req.app.get('io');
  if (io) {
    broadcastNewMessage(io, { message }).catch((err) => {
      console.error('[sendMessage] broadcast failed:', err);
    });
  }

  res.status(201).json({ success: true, data: serializeMessage(message) });
});

// PATCH /api/messages/:id
export const editMessageController = asyncHandler(async (req, res) => {
  const updated = await editMessage({
    messageId: req.params.id,
    actor: req.user,
    text: req.body.text,
  });

  const io = req.app.get('io');
  if (io) broadcastEditedMessage(io, { message: updated });

  res.status(200).json({ success: true, data: serializeMessage(updated) });
});

// DELETE /api/messages/:id
export const deleteMessageController = asyncHandler(async (req, res) => {
  const scope = req.body?.for;
  const result = await deleteMessage({
    messageId: req.params.id,
    actor: req.user,
    scope,
  });

  const io = req.app.get('io');
  const conversationId = String(result.message.conversationId);

  if (result.scope === 'self') {
    if (io) {
      // 'self' scope only reaches the actor's other devices — never the
      // rest of the conversation. The broadcaster enforces this routing.
      broadcastDeletedMessage(io, {
        conversationId,
        messageId: req.params.id,
        scope: 'self',
        actorUserId: req.user._id,
      });
    }
    return res
      .status(200)
      .json({ success: true, data: { id: req.params.id, scope: 'self' } });
  }

  if (io) {
    broadcastDeletedMessage(io, {
      conversationId,
      messageId: req.params.id,
      scope: 'everyone',
    });
  }

  // Permanent delete: orphaned Cloudinary assets become billable storage
  // forever. Fire-and-forget so the response is not blocked by Cloudinary
  // latency, and any failure is logged inside `safeDestroy` itself.
  if (result.imagePublicId) {
    safeDestroy(result.imagePublicId);
  }

  res.status(200).json({
    success: true,
    data: {
      scope: 'everyone',
      message: serializeMessage(result.message),
    },
  });
});

// POST /api/messages/:id/reactions
export const toggleReactionController = asyncHandler(async (req, res) => {
  const { action, message } = await toggleReaction({
    messageId: req.params.id,
    actor: req.user,
    emoji: req.body.emoji,
  });

  const io = req.app.get('io');
  if (io) broadcastReactionUpdated(io, { message });

  res.status(200).json({
    success: true,
    data: {
      action,
      reactions: message.reactions,
      message: serializeMessage(message),
    },
  });
});

// GET /api/conversations/:id/messages/search
export const searchMessagesController = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  if (typeof q !== 'string') {
    throw ApiError.badRequest('Search term is required');
  }

  const { items, total } = await searchMessages({
    conversationId: req.params.id,
    userId: req.user._id,
    q,
    limit: limit ?? 30,
  });

  res.status(200).json({
    success: true,
    data: { items: items.map(serializeMessage), total },
  });
});
