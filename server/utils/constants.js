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
