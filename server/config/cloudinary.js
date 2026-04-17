import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { env } from './env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Allow-list of fully-qualified Cloudinary CDN prefixes for the
 * configured cloud name. Computed once at module load — when the
 * cloud name is missing (e.g. local dev without credentials) the
 * list is empty and every URL is rejected, which is exactly what we
 * want: an unconfigured server should never accept arbitrary image
 * URLs from clients.
 *
 * Centralised here (instead of being duplicated inside services and
 * validators) so changing the policy — e.g. dropping http://, or
 * widening to a custom CNAME — is a single-file edit.
 */
const ALLOWED_CLOUDINARY_PREFIXES = (() => {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) return [];
  return Object.freeze([
    `https://res.cloudinary.com/${cloudName}/`,
    `http://res.cloudinary.com/${cloudName}/`,
  ]);
})();

/**
 * Strict check: does `url` resolve to an asset on OUR Cloudinary
 * cloud? A plain `isURL()` is not enough — without the prefix gate,
 * a malicious client could inject any URL (tracking pixel, attacker
 * CDN, javascript: URI on misconfigured viewers) into a message
 * `imageUrl` or an `avatarUrl` field.
 */
export const isAllowedCloudinaryUrl = (url) => {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (ALLOWED_CLOUDINARY_PREFIXES.length === 0) return false;
  return ALLOWED_CLOUDINARY_PREFIXES.some((prefix) => url.startsWith(prefix));
};

/**
 * Reusable express-validator `.custom()` callback. Accepts the
 * empty string (used to clear an avatar) but rejects anything else
 * that does not point at our configured Cloudinary cloud.
 */
export const cloudinaryUrlValidator = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (!isAllowedCloudinaryUrl(value)) {
    throw new Error('URL must point to the configured Cloudinary CDN');
  }
  return true;
};

/**
 * Upload an in-memory file buffer to Cloudinary.
 * @param {Buffer} buffer  raw file bytes (e.g. from multer.memoryStorage()).
 * @param {string} folder  Cloudinary folder name.
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const streamUpload = (buffer, folder) =>
  new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buffer)) {
      reject(new Error('streamUpload: buffer must be a Buffer instance.'));
      return;
    }
    if (!folder || typeof folder !== 'string') {
      reject(new Error('streamUpload: folder is required.'));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // Sensible defaults: strip exif/metadata, downscale huge images.
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed without a result.'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

/**
 * Best-effort destruction of a Cloudinary asset by `publicId`. Always
 * resolves — billing-side cleanup failures must NEVER break a user-facing
 * flow that already succeeded (avatar replace, message delete, etc.).
 *
 * `invalidate: true` purges the CDN edge caches as well, so the deleted
 * URL stops serving stale bytes within seconds rather than hours.
 */
export const safeDestroy = async (publicId) => {
  if (!publicId || typeof publicId !== 'string') return;
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (error) {
    console.warn(`[cloudinary] failed to destroy ${publicId}:`, error?.message);
  }
};

export { cloudinary };
