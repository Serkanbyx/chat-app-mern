import { Router } from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  deleteAccount,
} from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/rateLimiters.js';
import {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateDeleteAccount,
} from '../validators/auth.validator.js';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account
 *     description: Creates a new user. Returns a signed JWT and the public user payload. Subject to `authLimiter`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, example: serkan }
 *               email: { type: string, format: email, example: user@example.com }
 *               password: { type: string, format: password, minLength: 8, example: StrongPassw0rd! }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/AuthTokenResponse' } } } }
 *       400: { description: Validation error, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Username or email already in use }
 *       429: { description: Too many requests }
 */
router.post('/register', authLimiter, validateRegister, register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: Returns a generic 401 on bad credentials to defeat user enumeration. Subject to `authLimiter`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/AuthTokenResponse' } } } }
 *       401: { description: Invalid email or password }
 *       429: { description: Too many requests }
 */
router.post('/login', authLimiter, validateLogin, login);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the authenticated user
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
 *       401: { description: Unauthorized }
 */
router.get('/me', protect, getMe);

/**
 * @openapi
 * /api/auth/profile:
 *   patch:
 *     tags: [Auth]
 *     summary: Update the authenticated user's profile
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               bio: { type: string }
 *               avatar: { type: string, description: Cloudinary URL returned by /api/upload/avatar }
 *     responses:
 *       200: { description: Updated user, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 */
router.patch('/profile', protect, validateUpdateProfile, updateProfile);

/**
 * @openapi
 * /api/auth/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change the authenticated user's password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200: { description: Password changed }
 *       400: { description: Validation error }
 *       401: { description: Current password is wrong }
 */
router.patch('/password', protect, validateChangePassword, changePassword);

/**
 * @openapi
 * /api/auth/account:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete the authenticated user's account
 *     description: Requires the current password as proof of intent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Account deleted }
 *       401: { description: Wrong password }
 */
router.delete('/account', protect, validateDeleteAccount, deleteAccount);

export default router;
