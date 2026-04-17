export const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

export const THEME = Object.freeze(['light', 'dark', 'system']);
export const FONT_SIZE = Object.freeze(['sm', 'md', 'lg']);
export const CONTENT_DENSITY = Object.freeze(['compact', 'comfortable']);

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const BIO_MAX_LENGTH = 200;

export const DELETED_USER_LABEL = 'Deleted User';

export const CONVERSATION_TYPES = Object.freeze({
  DIRECT: 'direct',
  GROUP: 'group',
});

export const MESSAGE_TYPES = Object.freeze({
  TEXT: 'text',
  IMAGE: 'image',
  SYSTEM: 'system',
});

export const MESSAGE_DELETED_FOR = Object.freeze({
  NONE: 'none',
  SELF: 'self',
  EVERYONE: 'everyone',
});

// Storage cap + DoS protection. Long-form content belongs in attachments.
export const MESSAGE_TEXT_MAX_LENGTH = 4000;
// Single grapheme cluster + ZWJ sequence comfortably fits in 4 chars.
export const REACTION_EMOJI_MAX_LENGTH = 4;
// Edit window: 15 minutes from message creation.
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
// Delete-for-everyone window for the sender: 5 minutes from creation.
export const MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS = 5 * 60 * 1000;

export const GROUP_NAME_MAX_LENGTH = 50;
export const GROUP_MIN_PARTICIPANTS = 2;
export const GROUP_MAX_PARTICIPANTS = 100;
export const DIRECT_PARTICIPANTS = 2;
