import { Router } from 'express';
import {
  searchUsers,
  getPublicProfile,
  updatePreferences,
  getBlockedUsers,
  blockUser,
  unblockUser,
} from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validateObjectId } from '../validators/common.validator.js';
import {
  validateSearchQuery,
  validateUsername,
  validatePreferences,
} from '../validators/user.validator.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/users/search:
 *   get:
 *     tags: [Users]
 *     summary: Search users by username (ReDoS-safe)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 1 }
 *     responses:
 *       200:
 *         description: Matching users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/User' }
 */
router.get('/search', validateSearchQuery, searchUsers);

/**
 * @openapi
 * /api/users/me/blocked:
 *   get:
 *     tags: [Users]
 *     summary: List users blocked by the current user
 *     responses:
 *       200: { description: OK }
 */
router.get('/me/blocked', getBlockedUsers);

/**
 * @openapi
 * /api/users/me/preferences:
 *   patch:
 *     tags: [Users]
 *     summary: Update user preferences (theme, density, privacy toggles, …)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme: { type: string, enum: [light, dark, system] }
 *               fontSize: { type: string, enum: [sm, md, lg] }
 *               density: { type: string, enum: [comfortable, compact] }
 *               reducedMotion: { type: boolean }
 *               showOnlineStatus: { type: boolean }
 *               showReadReceipts: { type: boolean }
 *     responses:
 *       200: { description: Updated user, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
 *       400: { description: Validation error }
 */
router.patch('/me/preferences', validatePreferences, updatePreferences);

/**
 * @openapi
 * /api/users/{userId}/block:
 *   post:
 *     tags: [Users]
 *     summary: Block a user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Blocked }
 *   delete:
 *     tags: [Users]
 *     summary: Unblock a user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Unblocked }
 */
router.post('/:userId/block', validateObjectId('userId'), blockUser);
router.delete('/:userId/block', validateObjectId('userId'), unblockUser);

/**
 * @openapi
 * /api/users/{username}:
 *   get:
 *     tags: [Users]
 *     summary: Get a public user profile by username
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
 *       404: { description: Not found }
 */
router.get('/:username', validateUsername, getPublicProfile);

export default router;
