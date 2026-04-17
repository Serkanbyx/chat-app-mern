import dotenv from 'dotenv';

dotenv.config();

const EXAMPLE_ADMIN_PASSWORD = 'ChangeMe_StrongPassword123!';
const EXAMPLE_JWT_SECRET = 'replace_with_64_char_random_hex_string';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: toInt(process.env.PORT, 5000),
  CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',

  MONGO_URI: process.env.MONGO_URI ?? 'mongodb://localhost:27017/chat_app',

  JWT_SECRET: process.env.JWT_SECRET ?? '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? '',

  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? 'admin',

  MAX_UPLOAD_SIZE_MB: toInt(process.env.MAX_UPLOAD_SIZE_MB, 5),
});

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/**
 * Hard-fail fast in production if any critical secret is missing or weak.
 * Called from index.js BEFORE the HTTP server starts listening.
 */
export const validateEnv = () => {
  if (!isProduction) return;

  const errors = [];

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET === EXAMPLE_JWT_SECRET) {
    errors.push('JWT_SECRET must be set and at least 32 characters long.');
  }
  if (!env.MONGO_URI) errors.push('MONGO_URI is required in production.');
  if (!env.CLIENT_URL) errors.push('CLIENT_URL is required in production.');

  if (!env.CLOUDINARY_CLOUD_NAME) errors.push('CLOUDINARY_CLOUD_NAME is required in production.');
  if (!env.CLOUDINARY_API_KEY) errors.push('CLOUDINARY_API_KEY is required in production.');
  if (!env.CLOUDINARY_API_SECRET) errors.push('CLOUDINARY_API_SECRET is required in production.');

  if (env.ADMIN_PASSWORD === EXAMPLE_ADMIN_PASSWORD) {
    errors.push('ADMIN_PASSWORD must not equal the example value in production.');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production environment:\n  - ${errors.join('\n  - ')}`);
  }
};
