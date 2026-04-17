import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
} from '../controllers/notification.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import {
  validateObjectId,
  validatePagination,
} from '../validators/common.validator.js';

const router = Router();

router.use(protect);

/**
 * Literal segments MUST be declared BEFORE the `/:id` family — without
 * this ordering Express would treat `unread-count` and `read-all` as
 * candidate `:id` values and `validateObjectId('id')` would reject
 * them with a 400 before the real handler runs.
 */
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);

router.get('/', validatePagination, getNotifications);

router.patch('/:id/read', validateObjectId('id'), markAsRead);
router.delete('/:id', validateObjectId('id'), dismissNotification);

export default router;
