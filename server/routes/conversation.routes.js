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

router.get('/', validatePagination, validateArchivedQuery, getConversations);

// Literal segments MUST be declared before the `/:id` family — otherwise
// `validateObjectId('id')` would short-circuit "unread-summary" with a 400
// before this handler ever runs.
router.get('/unread-summary', getUnreadSummary);

router.post('/direct', validateCreateDirect, createDirect);
router.post('/group', validateCreateGroup, createGroup);

router.get('/:id', validateObjectId('id'), getConversation);
router.patch(
  '/:id',
  validateObjectId('id'),
  validateUpdateConversation,
  updateConversation,
);
router.delete('/:id', validateObjectId('id'), deleteConversation);

router.post(
  '/:id/members',
  validateObjectId('id'),
  validateAddMembers,
  addMembers,
);
router.delete(
  '/:id/members/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  removeMember,
);

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

router.post('/:id/mute', validateObjectId('id'), toggleMute);
router.post('/:id/archive', validateObjectId('id'), toggleArchive);

router.post('/:id/read', validateObjectId('id'), markRead);

export default router;
