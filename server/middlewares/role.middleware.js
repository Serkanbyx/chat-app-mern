import { ApiError } from '../utils/apiError.js';
import { ROLES } from '../utils/constants.js';

/**
 * Allows the request only when the authenticated user is an admin.
 * Must run AFTER `protect`, otherwise `req.user` is undefined.
 */
export const adminOnly = (req, _res, next) => {
  if (req.user?.role !== ROLES.ADMIN) {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
};
