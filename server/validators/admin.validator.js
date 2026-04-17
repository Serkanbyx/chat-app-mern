import { body, query } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import {
  ROLES,
  USER_STATUS,
  REPORT_TARGET_TYPES,
  REPORT_STATUSES,
  REPORT_REVIEW_NOTE_MAX_LENGTH,
} from '../utils/constants.js';

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

const REPORT_TARGET_VALUES = Object.values(REPORT_TARGET_TYPES);

// Reverting a report back to `pending` would erase a moderator
// decision without a real audit hook — disallowed at the validator
// boundary so the controller never sees the bad state.
const REPORT_REVIEWABLE_STATUSES = Object.values(REPORT_STATUSES).filter(
  (s) => s !== REPORT_STATUSES.PENDING,
);

export const validateListReports = [
  query('status')
    .optional()
    .isIn(Object.values(REPORT_STATUSES))
    .withMessage(
      `status must be one of ${Object.values(REPORT_STATUSES).join(', ')}`,
    ),
  query('targetType')
    .optional()
    .isIn(REPORT_TARGET_VALUES)
    .withMessage(`targetType must be one of ${REPORT_TARGET_VALUES.join(', ')}`),
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

export const validateReviewReport = [
  body('status')
    .exists({ checkFalsy: true })
    .withMessage('status is required')
    .bail()
    .isIn(REPORT_REVIEWABLE_STATUSES)
    .withMessage(
      `status must be one of ${REPORT_REVIEWABLE_STATUSES.join(', ')}`,
    ),
  body('reviewNote')
    .optional()
    .isString()
    .withMessage('reviewNote must be a string')
    .bail()
    .trim()
    .isLength({ max: REPORT_REVIEW_NOTE_MAX_LENGTH })
    .withMessage(
      `reviewNote must be at most ${REPORT_REVIEW_NOTE_MAX_LENGTH} characters`,
    ),
  validate,
];

export const validateAdminConversationMessages = [
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
