import { Router } from 'express';
import {
  uploadAvatarController,
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

router.post(
  '/avatar',
  uploadLimiter,
  uploadAvatar,
  handleUploadErrors,
  uploadAvatarController,
);

router.post(
  '/message-image',
  uploadLimiter,
  uploadMessageImage,
  handleUploadErrors,
  uploadMessageImageController,
);

export default router;
