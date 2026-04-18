import { Router } from 'express';
import {
  getMessages,
  sendMessage,
  editMessageController,
  deleteMessageController,
  toggleReactionController,
  searchMessagesController,
} from '../controllers/message.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { messageLimiter } from '../middlewares/rateLimiters.js';
import { validateObjectId } from '../validators/common.validator.js';
import {
  validateMessageQuery,
  validateSendMessage,
  validateEditMessage,
  validateDeleteMessage,
  validateReaction,
  validateSearchQuery,
} from '../validators/message.validator.js';

/**
 * Conversation-scoped router. Mounted at `/api/conversations/:id/messages`
 * with `mergeParams: true` so handlers see `req.params.id` resolved by the
 * parent mount path.
 *
 * Note: search must be declared BEFORE the bare `/` POST/GET so Express
 * doesn't treat "search" as the conversation id segment of a sibling route.
 */
export const conversationMessageRouter = Router({ mergeParams: true });

conversationMessageRouter.use(protect);

/**
 * @openapi
 * /api/conversations/{id}/messages/search:
 *   get:
 *     tags: [Messages]
 *     summary: Full-text search messages within a conversation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 1 }
 *     responses:
 *       200: { description: Matching messages }
 *       400: { description: Validation error }
 *       403: { description: Not a participant }
 */
conversationMessageRouter.get(
  '/search',
  validateObjectId('id'),
  validateSearchQuery,
  searchMessagesController,
);

/**
 * @openapi
 * /api/conversations/{id}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: List messages in a conversation (cursor or page based)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: before
 *         schema: { type: string, format: date-time }
 *         description: Return messages created before this timestamp.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 30 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Message' }
 *   post:
 *     tags: [Messages]
 *     summary: Send a message in a conversation
 *     description: Subject to `messageLimiter`. Use `/api/upload/message-image` first to obtain `imageUrl`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type: { type: string, enum: [text, image], default: text }
 *               content: { type: string, example: 'Hello world' }
 *               imageUrl: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Message' } } } }
 *       400: { description: Validation error }
 *       403: { description: Not a participant or blocked }
 *       429: { description: Too many messages }
 */
conversationMessageRouter.get(
  '/',
  validateObjectId('id'),
  validateMessageQuery,
  getMessages,
);

conversationMessageRouter.post(
  '/',
  messageLimiter,
  validateObjectId('id'),
  validateSendMessage,
  sendMessage,
);

/**
 * Flat message router — `/api/messages/...`. Operations here are scoped
 * by message id; participant membership is enforced inside each service
 * call via `assertParticipant` against the parent conversation.
 */
export const messageRouter = Router();

messageRouter.use(protect);

/**
 * @openapi
 * /api/messages/{id}:
 *   patch:
 *     tags: [Messages]
 *     summary: Edit a message (sender only, within 15 min)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       200: { description: Edited, content: { application/json: { schema: { $ref: '#/components/schemas/Message' } } } }
 *       403: { description: Not the sender or window expired }
 *   delete:
 *     tags: [Messages]
 *     summary: Delete a message (for me / for everyone within 5 min)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [me, everyone], default: me }
 *     responses:
 *       200: { description: Deleted }
 *       403: { description: Not allowed }
 */
messageRouter.patch(
  '/:id',
  validateObjectId('id'),
  validateEditMessage,
  editMessageController,
);

messageRouter.delete(
  '/:id',
  validateObjectId('id'),
  validateDeleteMessage,
  deleteMessageController,
);

/**
 * @openapi
 * /api/messages/{id}/reactions:
 *   post:
 *     tags: [Messages]
 *     summary: Toggle a single emoji reaction on a message
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emoji]
 *             properties:
 *               emoji: { type: string, example: '👍' }
 *     responses:
 *       200: { description: Updated reactions array }
 *       400: { description: Validation error }
 *       403: { description: Not a participant }
 */
messageRouter.post(
  '/:id/reactions',
  validateObjectId('id'),
  validateReaction,
  toggleReactionController,
);

export default messageRouter;
