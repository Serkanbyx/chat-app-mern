import { validationResult } from 'express-validator';

/**
 * Aggregates express-validator results and returns a 400 with a
 * field-keyed error map. Designed to run as the LAST item in a
 * validator chain array (e.g. `[...validateRegister, validate]`).
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    })),
  });
};
