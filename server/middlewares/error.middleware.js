import { isProduction } from '../config/env.js';

/**
 * Translates internal/library-specific errors into safe HTTP responses.
 * Production payloads NEVER leak stack traces or Mongoose internals.
 */
const mapKnownError = (err) => {
  // Mongoose schema validation
  if (err.name === 'ValidationError') {
    const fields = Object.values(err.errors ?? {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return {
      status: 400,
      message: 'Validation failed',
      errors: fields.length ? fields : undefined,
    };
  }

  // Bad ObjectId / type cast
  if (err.name === 'CastError') {
    return { status: 400, message: `Invalid value for field "${err.path}"` };
  }

  // Unique index violation — generic message avoids field enumeration
  if (err.name === 'MongoServerError' && err.code === 11000) {
    return { status: 409, message: 'Resource already exists' };
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Invalid token' };
  }
  if (err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Token expired' };
  }

  return null;
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const mapped = mapKnownError(err);

  const status =
    mapped?.status ??
    (Number.isInteger(err.statusCode) ? err.statusCode : 500);
  const message = mapped?.message ?? err.message ?? 'Internal Server Error';

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
  }

  const payload = { success: false, message };
  if (mapped?.errors) payload.errors = mapped.errors;
  if (err.details) payload.details = err.details;

  if (!isProduction && err.stack) {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};
