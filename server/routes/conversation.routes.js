import { Router } from 'express';
import {
  getConversations,
  createDirect,
  createGroup,
  getConversation,
  updateConversation,
  addMembers,
  removeMember,
  promoteAdmin,
  demoteAdmin,
  toggleMute,
  toggleArchive,
  deleteConversation,
  markRead,
  getUnreadSummary,
} from '../controllers/conversation.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import {
  validateObjectId,
  validatePagination,
} from '../validators/common.validator.js';
import {
  validateCreateDirect,
  validateCreateGroup,
  validateUpdateConversation,
  validateAddMembers,
  validateArchivedQuery,
} from '../validators/conversation.validator.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/conversations:
 *   get:
 *     tags: [Conversations]
 *     summary: List conversations the user participates in
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: archived
 *         schema: { type: boolean }
 *         description: When true, returns only archived conversations.
 *     responses:
 *       200:
 *         description: Page of conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Conversation' }
 *       401: { description: Unauthorized }
 */
router.get('/', validatePagination, validateArchivedQuery, getConversations);

/**
 * @openapi
 * /api/conversations/unread-summary:
 *   get:
 *     tags: [Conversations]
 *     summary: Per-conversation unread counts for the current user
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
router.get('/unread-summary', getUnreadSummary);

/**
 * @openapi
 * /api/conversations/direct:
 *   post:
 *     tags: [Conversations]
 *     summary: Open or fetch a 1-1 direct conversation with a peer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: Mongo ObjectId of the peer }
 *     responses:
 *       200: { description: Existing or newly created conversation, content: { application/json: { schema: { $ref: '#/components/schemas/Conversation' } } } }
 *       400: { description: Validation error }
 *       404: { description: Peer not found }
 */
router.post('/direct', validateCreateDirect, createDirect);

/**
 * @openapi
 * /api/conversations/group:
 *   post:
 *     tags: [Conversations]
 *     summary: Create a new group conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, members]
 *             properties:
 *               name: { type: string, example: 'Project Avengers' }
 *               members:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, description: User id }
 *     responses:
 *       201: { description: Group created, content: { application/json: { schema: { $ref: '#/components/schemas/Conversation' } } } }
 *       400: { description: Validation error }
 */
router.post('/group', validateCreateGroup, createGroup);

/**
 * @openapi
 * /api/conversations/{id}:
 *   get:
 *     tags: [Conversations]
 *     summary: Get a single conversation
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Conversation' } } } }
 *       403: { description: Not a participant }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Conversations]
 *     summary: Rename a group or update settings
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200: { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Conversation' } } } }
 *       403: { description: Admin only }
 *   delete:
 *     tags: [Conversations]
 *     summary: Delete (or leave) a conversation
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     responses:
 *       200: { description: Deleted }
 *       403: { description: Forbidden }
 */
router.get('/:id', validateObjectId('id'), getConversation);
router.patch(
  '/:id',
  validateObjectId('id'),
  validateUpdateConversation,
  updateConversation,
);
router.delete('/:id', validateObjectId('id'), deleteConversation);

/**
 * @openapi
 * /api/conversations/{id}/members:
 *   post:
 *     tags: [Conversations]
 *     summary: Add members to a group
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [members]
 *             properties:
 *               members:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200: { description: Updated conversation }
 *       403: { description: Admin only }
 */
router.post(
  '/:id/members',
  validateObjectId('id'),
  validateAddMembers,
  addMembers,
);

/**
 * @openapi
 * /api/conversations/{id}/members/{userId}:
 *   delete:
 *     tags: [Conversations]
 *     summary: Remove a member from a group
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed }
 *       403: { description: Admin only / last-admin protection }
 */
router.delete(
  '/:id/members/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  removeMember,
);

/**
 * @openapi
 * /api/conversations/{id}/admins/{userId}:
 *   post:
 *     tags: [Conversations]
 *     summary: Promote a member to group admin
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Promoted }
 *       403: { description: Admin only }
 *   delete:
 *     tags: [Conversations]
 *     summary: Demote a group admin back to member
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Demoted }
 *       403: { description: Admin only / last-admin protection }
 */
router.post(
  '/:id/admins/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  promoteAdmin,
);
router.delete(
  '/:id/admins/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  demoteAdmin,
);

/**
 * @openapi
 * /api/conversations/{id}/mute:
 *   post:
 *     tags: [Conversations]
 *     summary: Toggle mute for the current user on this conversation
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     responses:
 *       200: { description: New mute state }
 */
router.post('/:id/mute', validateObjectId('id'), toggleMute);

/**
 * @openapi
 * /api/conversations/{id}/archive:
 *   post:
 *     tags: [Conversations]
 *     summary: Toggle archive for the current user on this conversation
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     responses:
 *       200: { description: New archive state }
 */
router.post('/:id/archive', validateObjectId('id'), toggleArchive);

/**
 * @openapi
 * /api/conversations/{id}/read:
 *   post:
 *     tags: [Conversations]
 *     summary: Mark all messages in a conversation as read
 *     parameters:
 *       - $ref: '#/components/parameters/ConversationId'
 *     responses:
 *       200: { description: Read receipt broadcast }
 */
router.post('/:id/read', validateObjectId('id'), markRead);

/**
 * @openapi
 * components:
 *   parameters:
 *     ConversationId:
 *       in: path
 *       name: id
 *       required: true
 *       schema: { type: string, description: Mongo ObjectId }
 *       description: Conversation id
 */

export default router;
