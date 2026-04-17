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
  toggleMute,
  toggleArchive,
  deleteConversation,
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
} from '../validators/conversation.validator.js';

const router = Router();

router.use(protect);

router.get('/', validatePagination, getConversations);

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

router.post('/:id/mute', validateObjectId('id'), toggleMute);
router.post('/:id/archive', validateObjectId('id'), toggleArchive);

export default router;
