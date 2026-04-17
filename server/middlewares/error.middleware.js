import { isProduction } from '../config/env.js';

/**
 * Catches anything thrown / passed via `next(err)` from a route or middleware.
 * Full error mapping (ValidationError, CastError, duplicate key, etc.) is
 * implemented in STEP 3. This is the always-mounted last-resort handler.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
  }

  const payload = { success: false, message };
  if (!isProduction && err.stack) {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};
