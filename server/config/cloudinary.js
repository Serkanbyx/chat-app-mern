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

export { cloudinary };
