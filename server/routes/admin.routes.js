import { Router } from 'express';
import {
  getStats,
  listUsers,
  getUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  listReports,
  getReport,
  reviewReport,
  forceDeleteMessage,
  adminGetConversationMessages,
} from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { adminLimiter } from '../middlewares/rateLimiters.js';
import { validateObjectId } from '../validators/common.validator.js';
import {
  validateListUsers,
  validateUpdateUserStatus,
  validateUpdateUserRole,
  validateListReports,
  validateReviewReport,
  validateAdminConversationMessages,
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

/* -------------------- STEP 18 — Moderation surface -------------------- */

router.get('/reports', validateListReports, listReports);
router.get('/reports/:id', validateObjectId('id'), getReport);
router.patch(
  '/reports/:id',
  validateObjectId('id'),
  validateReviewReport,
  reviewReport,
);

// Force-delete bypasses the sender-only / time-window rules but still
// emits `message:deleted` so participants' UIs redact the bubble. See
// `forceDeleteMessage` in admin.controller.js.
router.delete('/messages/:id', validateObjectId('id'), forceDeleteMessage);

// Audit window into any conversation. The handler appends an entry to
// `AdminAuditLog` BEFORE returning so the access is recorded even if
// the response is dropped client-side.
router.get(
  '/conversations/:id/messages',
  validateObjectId('id'),
  validateAdminConversationMessages,
  adminGetConversationMessages,
);

export default router;
