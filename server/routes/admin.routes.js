import { Router } from 'express';
import {
  getStats,
  listUsers,
  getUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
} from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { adminLimiter } from '../middlewares/rateLimiters.js';
import { validateObjectId } from '../validators/common.validator.js';
import {
  validateListUsers,
  validateUpdateUserStatus,
  validateUpdateUserRole,
} from '../validators/admin.validator.js';

const router = Router();

/**
 * Every route on this surface is gated by the SAME triple: a hard
 * auth check (`protect`), the admin role gate (`adminOnly`), and a
 * dedicated rate limiter so a misbehaving admin token cannot use the
 * elevated bucket from `globalLimiter`. Mounting at the router level
 * keeps it impossible to register a route here that accidentally
 * skips one of the three.
 */
router.use(protect, adminOnly, adminLimiter);

router.get('/stats', getStats);
router.get('/users', validateListUsers, listUsers);
router.get('/users/:id', validateObjectId('id'), getUser);
router.patch(
  '/users/:id/status',
  validateObjectId('id'),
  validateUpdateUserStatus,
  updateUserStatus,
);
router.patch(
  '/users/:id/role',
  validateObjectId('id'),
  validateUpdateUserRole,
  updateUserRole,
);
router.delete('/users/:id', validateObjectId('id'), deleteUser);

export default router;
