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

/**
 * Strip server-only / per-user fields before sending a message to the
 * client. `hiddenFor` is a server-side bookkeeping array — never expose
 * the list of users who hid the message.
 */
const serializeMessage = (doc) => {
  if (!doc) return null;
  const obj =
    typeof doc.toObject === 'function'
      ? doc.toObject({ virtuals: false, versionKey: false })
      : { ...doc };
  delete obj.hiddenFor;
  return obj;
};

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

  res.status(201).json({ success: true, data: serializeMessage(message) });
});

// PATCH /api/messages/:id
export const editMessageController = asyncHandler(async (req, res) => {
  const updated = await editMessage({
    messageId: req.params.id,
    actor: req.user,
    text: req.body.text,
  });
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

  if (result.scope === 'self') {
    return res
      .status(200)
      .json({ success: true, data: { id: req.params.id, scope: 'self' } });
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
