import { param, query } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';

/**
 * Generic ObjectId guard for path params. Use as middleware in any
 * `/:id`-style route to fail fast with a 400 BEFORE reaching DB code that
 * would otherwise throw a CastError.
 *
 *   router.get('/:id', protect, validateObjectId(), handler);
 *   router.delete('/:userId', protect, validateObjectId('userId'), handler);
 */
export const validateObjectId = (name = 'id') => [
  param(name).isMongoId().withMessage(`${name} must be a valid id`),
  validate,
];

/**
 * Generic offset pagination guard. Pairs with `parsePagination` from
 * `utils/pagination.js`. Limit hard-clamped at 50 to defuse single-shot
 * data exfiltration; values are coerced to integers via `.toInt()` so
 * downstream code never has to re-parse them.
 */
export const validatePagination = [
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
