/**
 * Wraps an async route handler so any rejected promise is forwarded to
 * Express' error middleware via `next(err)` — removes repetitive try/catch.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
