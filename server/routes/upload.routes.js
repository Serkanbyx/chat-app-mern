import { Router } from 'express';
import {
  uploadAvatarController,
  deleteAvatarController,
  uploadMessageImageController,
} from '../controllers/upload.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { uploadLimiter } from '../middlewares/rateLimiters.js';
import {
  uploadAvatar,
  uploadMessageImage,
  handleUploadErrors,
} from '../middlewares/upload.middleware.js';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /api/upload/avatar:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a new avatar image (JPEG/PNG/WebP, ≤5 MB)
 *     description: Streams the file to Cloudinary via `multer.memoryStorage`. Subject to `uploadLimiter`.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string, example: 'https://res.cloudinary.com/.../avatar.webp' }
 *       400: { description: Bad MIME type or oversize }
 *       429: { description: Too many uploads }
 */
router.post(
  '/avatar',
  uploadLimiter,
  uploadAvatar,
  handleUploadErrors,
  uploadAvatarController,
);

/**
 * @openapi
 * /api/upload/avatar:
 *   delete:
 *     tags: [Uploads]
 *     summary: Remove the caller's avatar
 *     description: Clears `avatarUrl` / `avatarPublicId` on the user and destroys the Cloudinary asset. Idempotent.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     removed: { type: boolean }
 *       401: { description: Unauthenticated }
 */
router.delete('/avatar', deleteAvatarController);

/**
 * @openapi
 * /api/upload/message-image:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload an image to attach to a message
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string }
 *       400: { description: Bad MIME type or oversize }
 *       429: { description: Too many uploads }
 */
router.post(
  '/message-image',
  uploadLimiter,
  uploadMessageImage,
  handleUploadErrors,
  uploadMessageImageController,
);

export default router;
