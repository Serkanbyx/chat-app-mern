import { body, query } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import { ROLES, USER_STATUS } from '../utils/constants.js';

/**
 * Admin endpoints accept a deliberately tiny status surface — `deleted`
 * is a tombstone driven by the user-initiated delete flow and the
 * admin hard-delete cascade, so it is NEVER directly settable.
 */
const ADMIN_SETTABLE_STATUSES = Object.freeze([
  USER_STATUS.ACTIVE,
  USER_STATUS.SUSPENDED,
]);

const ADMIN_SETTABLE_ROLES = Object.freeze([ROLES.USER, ROLES.ADMIN]);

/**
 * Search guard for the admin user list. The free-text `q` is bounded
 * tightly so the downstream `$regex` (built with `escapeRegex`) cannot
 * be coerced into a pathological pattern, and so the request body
 * stays small enough to keep the surface predictable for log audits.
 */
export const validateListUsers = [
  query('status')
    .optional()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`status must be one of ${Object.values(USER_STATUS).join(', ')}`),
  query('role')
    .optional()
    .isIn(Object.values(ROLES))
    .withMessage(`role must be one of ${Object.values(ROLES).join(', ')}`),
  query('q')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 60 })
    .withMessage('q must be at most 60 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be an integer between 1 and 50')
    .toInt(),
  validate,
];

export const validateUpdateUserStatus = [
  body('status')
    .isIn(ADMIN_SETTABLE_STATUSES)
    .withMessage(`status must be one of ${ADMIN_SETTABLE_STATUSES.join(', ')}`),
  validate,
];

export const validateUpdateUserRole = [
  body('role')
    .isIn(ADMIN_SETTABLE_ROLES)
    .withMessage(`role must be one of ${ADMIN_SETTABLE_ROLES.join(', ')}`),
  validate,
];
