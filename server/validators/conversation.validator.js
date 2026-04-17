import { body } from 'express-validator';
import { validate } from '../middlewares/validate.middleware.js';
import {
  GROUP_NAME_MAX_LENGTH,
  GROUP_MAX_PARTICIPANTS,
} from '../utils/constants.js';

// Server adds the creator → caller may submit at most (CAP - 1) other ids.
const MAX_OTHER_PARTICIPANTS = GROUP_MAX_PARTICIPANTS - 1;

const groupNameRule = ({ optional = false } = {}) => {
  const chain = body('name').trim();
  return (optional ? chain.optional({ values: 'falsy' }) : chain)
    .isLength({ min: 1, max: GROUP_NAME_MAX_LENGTH })
    .withMessage(`Group name must be 1–${GROUP_NAME_MAX_LENGTH} characters`)
    .escape();
};

const avatarUrlRule = () =>
  body('avatarUrl')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('avatarUrl must be a valid http(s) URL');

export const validateCreateDirect = [
  body('userId').isMongoId().withMessage('userId must be a valid id'),
  validate,
];

export const validateCreateGroup = [
  groupNameRule({ optional: false }),
  body('participantIds')
    .isArray({ min: 1, max: MAX_OTHER_PARTICIPANTS })
    .withMessage(
      `participantIds must contain between 1 and ${MAX_OTHER_PARTICIPANTS} ids`,
    ),
  body('participantIds.*')
    .isMongoId()
    .withMessage('Every participantId must be a valid id'),
  avatarUrlRule(),
  validate,
];

export const validateUpdateConversation = [
  groupNameRule({ optional: true }),
  avatarUrlRule(),
  // Reject calls that don't actually carry an updatable field.
  body().custom((value) => {
    const hasName = typeof value?.name === 'string' && value.name.trim().length > 0;
    const hasAvatar = typeof value?.avatarUrl === 'string';
    if (!hasName && !hasAvatar) {
      throw new Error('Provide at least one of: name, avatarUrl');
    }
    return true;
  }),
  validate,
];

export const validateAddMembers = [
  body('userIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('userIds must contain between 1 and 50 ids'),
  body('userIds.*')
    .isMongoId()
    .withMessage('Every userId must be a valid id'),
  validate,
];
