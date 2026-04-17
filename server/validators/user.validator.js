import { body, param, query } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import {
  USERNAME_REGEX,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  THEME,
  FONT_SIZE,
  CONTENT_DENSITY,
} from '../utils/constants.js';

const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 30;

/**
 * Search query guard. The escaping (for safe regex use) happens in the
 * controller via `escapeRegex` — here we only enforce shape and length to
 * cap the work both validators and Mongo will do.
 */
export const validateSearchQuery = [
  query('q')
    .exists({ checkFalsy: true })
    .withMessage('Query string "q" is required')
    .bail()
    .isString()
    .trim()
    .isLength({ min: SEARCH_MIN_LENGTH, max: SEARCH_MAX_LENGTH })
    .withMessage(
      `Query must be ${SEARCH_MIN_LENGTH}-${SEARCH_MAX_LENGTH} characters`,
    ),
  validate,
];

/**
 * Username path-parameter guard. We deliberately do NOT use isMongoId here
 * because public profile lookups are by username, not id. Lowercasing
 * matches the DB representation and avoids needless cache misses.
 */
export const validateUsername = [
  param('username')
    .isString()
    .trim()
    .toLowerCase()
    .isLength({ min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
    .withMessage(
      `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`,
    )
    .matches(USERNAME_REGEX)
    .withMessage('Username may only contain letters, numbers, and underscores'),
  validate,
];

/**
 * Strict per-field guards for the preferences subdocument. Two layers
 * of safety are applied:
 *
 *  1. Each known field is validated against its enum / type.
 *  2. The body root is validated against an allow-list of keys — any
 *     unknown key (top-level OR inside `notifications`) is rejected
 *     with a 400 instead of being silently dropped. This protects
 *     against typos AND against a future field rename leaving stale
 *     payloads in flight from cached clients.
 *
 * Adding a new preference therefore requires touching THREE places:
 * this allow-list, the per-field rule above, and the controller
 * whitelist (`PREFERENCE_PATHS` in user.controller.js). The triple-edit
 * is intentional — it forces a deliberate decision per addition.
 */
const ALLOWED_PREFERENCE_KEYS = Object.freeze([
  'theme',
  'fontSize',
  'contentDensity',
  'animations',
  'enterToSend',
  'showReadReceipts',
  'showOnlineStatus',
  'notifications',
]);

const ALLOWED_NOTIFICATION_KEYS = Object.freeze([
  'browser',
  'sound',
  'muteAll',
]);

export const validatePreferences = [
  body('theme').optional().isIn(THEME).withMessage(`theme must be one of: ${THEME.join(', ')}`),
  body('fontSize').optional().isIn(FONT_SIZE).withMessage(`fontSize must be one of: ${FONT_SIZE.join(', ')}`),
  body('contentDensity')
    .optional()
    .isIn(CONTENT_DENSITY)
    .withMessage(`contentDensity must be one of: ${CONTENT_DENSITY.join(', ')}`),
  body('animations').optional().isBoolean().withMessage('animations must be boolean').toBoolean(),
  body('enterToSend').optional().isBoolean().withMessage('enterToSend must be boolean').toBoolean(),
  body('showReadReceipts').optional().isBoolean().withMessage('showReadReceipts must be boolean').toBoolean(),
  body('showOnlineStatus').optional().isBoolean().withMessage('showOnlineStatus must be boolean').toBoolean(),
  body('notifications').optional().isObject().withMessage('notifications must be an object'),
  body('notifications.browser').optional().isBoolean().withMessage('notifications.browser must be boolean').toBoolean(),
  body('notifications.sound').optional().isBoolean().withMessage('notifications.sound must be boolean').toBoolean(),
  body('notifications.muteAll').optional().isBoolean().withMessage('notifications.muteAll must be boolean').toBoolean(),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object');
    }
    const keys = Object.keys(value);
    if (keys.length === 0) {
      throw new Error('Provide at least one preference field to update');
    }

    const unknown = keys.filter((k) => !ALLOWED_PREFERENCE_KEYS.includes(k));
    if (unknown.length > 0) {
      throw new Error(`Unknown preference field(s): ${unknown.join(', ')}`);
    }

    if (value.notifications && typeof value.notifications === 'object') {
      const notifKeys = Object.keys(value.notifications);
      const unknownNotif = notifKeys.filter(
        (k) => !ALLOWED_NOTIFICATION_KEYS.includes(k),
      );
      if (unknownNotif.length > 0) {
        throw new Error(
          `Unknown notifications field(s): ${unknownNotif.join(', ')}`,
        );
      }
    }

    return true;
  }),
  validate,
];
