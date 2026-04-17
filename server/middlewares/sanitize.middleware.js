import mongoSanitize from 'express-mongo-sanitize';

/**
 * Express 5 compatible NoSQL injection sanitizer.
 *
 * IMPORTANT: We intentionally skip `req.query`. In Express 5 `req.query` is a
 * read-only getter; assigning to it (which the express-mongo-sanitize
 * middleware does) crashes the server. Validators handle query params instead.
 */
export const sanitizeRequest = (req, _res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
};
