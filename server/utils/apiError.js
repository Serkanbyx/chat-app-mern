/**
 * Operational HTTP error. Carries a status code so the global error
 * handler can map it to a proper response without leaking internals.
 */
export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true;
    if (code) this.code = code;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', meta) {
    return new ApiError(400, message, meta);
  }
  static unauthorized(message = 'Unauthorized', meta) {
    return new ApiError(401, message, meta);
  }
  static forbidden(message = 'Forbidden', meta) {
    return new ApiError(403, message, meta);
  }
  static notFound(message = 'Not found', meta) {
    return new ApiError(404, message, meta);
  }
  static conflict(message = 'Conflict', meta) {
    return new ApiError(409, message, meta);
  }
  static tooMany(message = 'Too many requests', meta) {
    return new ApiError(429, message, meta);
  }
  static internal(message = 'Internal server error', meta) {
    return new ApiError(500, message, meta);
  }
}
