import { body, query } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import {
  MESSAGE_TYPES,
  MESSAGE_TEXT_MAX_LENGTH,
  REACTION_EMOJI_MAX_LENGTH,
} from '../utils/constants.js';

/**
 * Cursor pagination guard for `GET /api/conversations/:id/messages`.
 *
 * `limit` is hard-clamped to 50 to defuse single-shot data exfiltration;
 * `before` is an opaque cursor (the last message id in the previous page)
 * and is validated as an ObjectId BEFORE it reaches Mongo to fail fast on
 * obvious abuse.
 */
export const validateMessageQuery = [
  query('before')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('before must be a valid message id'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be an integer between 1 and 50')
    .toInt(),
  validate,
];

const SEND_MESSAGE_TYPES = [MESSAGE_TYPES.TEXT, MESSAGE_TYPES.IMAGE];

/**
 * REST-fallback send. The Cloudinary URL whitelist lives in the service
 * (single source of truth) — this validator only enforces shape.
 */
export const validateSendMessage = [
  body('type')
    .optional()
    .isIn(SEND_MESSAGE_TYPES)
    .withMessage(`type must be one of: ${SEND_MESSAGE_TYPES.join(', ')}`),
  body('text')
    .if(
      (_value, { req }) =>
        (req.body?.type ?? MESSAGE_TYPES.TEXT) === MESSAGE_TYPES.TEXT,
    )
    .isString()
    .withMessage('text must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: MESSAGE_TEXT_MAX_LENGTH })
    .withMessage(`text must be 1–${MESSAGE_TEXT_MAX_LENGTH} characters`),
  body('imageUrl')
    .if((_value, { req }) => req.body?.type === MESSAGE_TYPES.IMAGE)
    .isURL({ protocols: ['https', 'http'], require_protocol: true })
    .withMessage('imageUrl must be a valid http(s) URL'),
  body('imagePublicId')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('imagePublicId must be a string')
    .isLength({ max: 200 })
    .withMessage('imagePublicId is too long'),
  body('replyTo')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('replyTo must be a valid message id'),
  validate,
];

export const validateEditMessage = [
  body('text')
    .isString()
    .withMessage('text must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: MESSAGE_TEXT_MAX_LENGTH })
    .withMessage(`text must be 1–${MESSAGE_TEXT_MAX_LENGTH} characters`),
  validate,
];

export const validateDeleteMessage = [
  body('for')
    .isIn(['self', 'everyone'])
    .withMessage("for must be one of: 'self' | 'everyone'"),
  validate,
];

/**
 * Reaction toggle. We measure with a code-point spread (`[...trimmed]`)
 * so multi-byte emoji sequences (e.g. ZWJ flags, skin-tone combos) aren't
 * mis-counted by `.length`.
 */
export const validateReaction = [
  body('emoji')
    .isString()
    .withMessage('emoji must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('emoji is required')
    .bail()
    .custom((value) => {
      if ([...value].length > REACTION_EMOJI_MAX_LENGTH) {
        throw new Error(
          `emoji must be at most ${REACTION_EMOJI_MAX_LENGTH} characters`,
        );
      }
      return true;
    }),
  validate,
];

export const validateSearchQuery = [
  query('q')
    .isString()
    .withMessage('q must be a string')
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('q must be 2–100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be an integer between 1 and 50')
    .toInt(),
  validate,
];
