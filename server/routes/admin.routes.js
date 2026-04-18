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

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: High-level platform stats (users, conversations, messages, reports)
 *     responses:
 *       200: { description: OK }
 *       403: { description: Admin only }
 */
router.get('/stats', getStats);

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users with filters and pagination
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, suspended] }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, admin] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: OK }
 */
router.get('/users', validateListUsers, listUsers);

/**
 * @openapi
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single user (admin view)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a user (and force-disconnect their sockets)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       403: { description: Cannot delete self or another admin }
 */
router.get('/users/:id', validateObjectId('id'), getUser);

/**
 * @openapi
 * /api/admin/users/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Suspend or reactivate a user
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, suspended] }
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Cannot suspend self or other admins }
 */
router.patch(
  '/users/:id/status',
  validateObjectId('id'),
  validateUpdateUserStatus,
  updateUserStatus,
);

/**
 * @openapi
 * /api/admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Promote a user to admin or demote to regular user
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
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [user, admin] }
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Cannot demote self or last admin }
 */
router.patch(
  '/users/:id/role',
  validateObjectId('id'),
  validateUpdateUserRole,
  updateUserRole,
);

router.delete('/users/:id', validateObjectId('id'), deleteUser);

/**
 * @openapi
 * /api/admin/reports:
 *   get:
 *     tags: [Admin]
 *     summary: List moderation reports
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, reviewed, dismissed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: OK }
 */
router.get('/reports', validateListReports, listReports);

/**
 * @openapi
 * /api/admin/reports/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single report
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   patch:
 *     tags: [Admin]
 *     summary: Review a report (mark resolved/dismissed and add notes)
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [reviewed, dismissed] }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Updated }
 */
router.get('/reports/:id', validateObjectId('id'), getReport);
router.patch(
  '/reports/:id',
  validateObjectId('id'),
  validateReviewReport,
  reviewReport,
);

/**
 * @openapi
 * /api/admin/messages/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Force-delete a message regardless of sender / time window
 *     description: |
 *       Bypasses the sender-only and 5-minute window rules but still emits
 *       `message:deleted` over Socket.io so participant UIs redact the bubble.
 *       Logged in `AdminAuditLog`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Message not found }
 */
router.delete('/messages/:id', validateObjectId('id'), forceDeleteMessage);

/**
 * @openapi
 * /api/admin/conversations/{id}/messages:
 *   get:
 *     tags: [Admin]
 *     summary: Audit window into any conversation's messages
 *     description: Appends to `AdminAuditLog` BEFORE returning so the access is recorded even if the response is dropped.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Page of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Message' }
 */
router.get(
  '/conversations/:id/messages',
  validateObjectId('id'),
  validateAdminConversationMessages,
  adminGetConversationMessages,
);

export default router;
