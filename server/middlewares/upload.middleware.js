import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Strict MIME whitelist. We intentionally exclude `image/svg+xml` because
 * SVG is XML and can carry embedded `<script>` payloads that would execute
 * in the browser if rendered inline. Cloudinary delivers raster images,
 * which are inert in this context.
 */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MB = 1024 * 1024;

/**
 * In-memory storage only — file buffers are streamed straight to Cloudinary
 * by the upload controller. No untrusted byte ever touches the server's
 * disk, which removes an entire class of LFI / path-traversal attacks.
 */
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (!file?.mimetype) {
    return cb(ApiError.badRequest('Missing file mime type'));
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      ApiError.badRequest(
        'Unsupported image type. Allowed: JPEG, PNG, WEBP.',
      ),
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * MB,
    files: 1,
    fields: 0,
    parts: 2,
  },
});

/** Single avatar image — field name `image`. */
export const uploadAvatar = upload.single('image');

/** Single message attachment — field name `image`. */
export const uploadMessageImage = upload.single('image');

/**
 * Translates Multer's MulterError into our ApiError shape so the global
 * error handler responds with a clean JSON body instead of HTML/text.
 * Mount this AFTER the upload middleware in any route that uses it.
 */
// eslint-disable-next-line no-unused-vars
export const handleUploadErrors = (err, _req, _res, next) => {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        ApiError.badRequest(
          `File too large. Max ${env.MAX_UPLOAD_SIZE_MB} MB.`,
        ),
      );
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest('Unexpected file field. Use "image".'));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(ApiError.badRequest('Only one file per request is allowed.'));
    }
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  }

  return next(err);
};
