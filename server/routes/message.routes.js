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

conversationMessageRouter.get(
  '/search',
  validateObjectId('id'),
  validateSearchQuery,
  searchMessagesController,
);

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

messageRouter.post(
  '/:id/reactions',
  validateObjectId('id'),
  validateReaction,
  toggleReactionController,
);

export default messageRouter;
