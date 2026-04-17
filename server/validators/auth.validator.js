import { body } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import { cloudinaryUrlValidator } from '../config/cloudinary.js';
import {
  USERNAME_REGEX,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  BIO_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../utils/constants.js';

const PASSWORD_COMPLEXITY = /^(?=.*[A-Za-z])(?=.*\d).+$/;

const usernameRule = () =>
  body('username')
    .trim()
    .isLength({ min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
    .withMessage(`Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`)
    .matches(USERNAME_REGEX)
    .withMessage('Username may only contain letters, numbers, and underscores')
    .escape();

const emailRule = () =>
  body('email')
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail();

const passwordCreateRule = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .matches(PASSWORD_COMPLEXITY)
    .withMessage('Password must contain at least one letter and one number');

const displayNameRule = (optional = false) => {
  const chain = body('displayName').trim();
  return (optional ? chain.optional() : chain)
    .isLength({ min: DISPLAY_NAME_MIN_LENGTH, max: DISPLAY_NAME_MAX_LENGTH })
    .withMessage(`Display name must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters`)
    .escape();
};

export const validateRegister = [
  usernameRule(),
  emailRule(),
  passwordCreateRule('password'),
  displayNameRule(false),
  validate,
];

export const validateLogin = [
  body('email').isEmail().withMessage('Invalid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

export const validateUpdateProfile = [
  displayNameRule(true),
  body('bio').optional().isString().isLength({ max: BIO_MAX_LENGTH })
    .withMessage(`Bio must be at most ${BIO_MAX_LENGTH} characters`)
    .trim()
    .escape(),
  body('avatarUrl')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Avatar URL must be a valid http(s) URL')
    .bail()
    // Avatar URLs MUST come from our own Cloudinary cloud — otherwise a
    // client could store an arbitrary URL (tracking pixel, attacker host,
    // unsafe scheme on a misconfigured renderer) in a public profile
    // field that other users will load.
    .custom(cloudinaryUrlValidator),
  body('avatarPublicId').optional().isString().isLength({ max: 200 })
    .withMessage('avatarPublicId is too long'),
  validate,
];

export const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordCreateRule('newPassword'),
  body('newPassword').custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error('New password must differ from current password');
    }
    return true;
  }),
  validate,
];

export const validateDeleteAccount = [
  body('password').notEmpty().withMessage('Password confirmation is required'),
  validate,
];
