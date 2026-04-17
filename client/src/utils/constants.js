/**
 * Frontend-wide constants.
 *
 * Anything that is referenced from more than one feature folder lives
 * here so we don't paper over typos with magic strings (`'token'` vs
 * `'authToken'`) or duplicate option lists between Settings UI and the
 * preference application logic.
 */

/* ------------------------------------------------------------------
 * Storage keys
 *
 * Centralising every `localStorage` key prevents collisions across
 * features and gives us a single place to bump versions if we ever
 * need to invalidate cached client state on deploy.
 * ------------------------------------------------------------------ */
export const STORAGE_KEYS = Object.freeze({
  TOKEN: 'token',
  GUEST_PREFERENCES: 'guestPreferences',
});

/* ------------------------------------------------------------------
 * Route paths
 *
 * Used by the auth flows (post-login redirect, logout redirect) and
 * route guards. Keeping them as constants makes refactors of the
 * URL space (e.g. moving `/chat` under `/app/chat`) a one-line change.
 * ------------------------------------------------------------------ */
export const ROUTES = Object.freeze({
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  CHAT: '/chat',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  ADMIN: '/admin',
});

/* ------------------------------------------------------------------
 * Preference enums
 *
 * Mirror the server-side `THEME` / `FONT_SIZE` / `CONTENT_DENSITY`
 * constants. Duplicated rather than imported from the server so the
 * client bundle stays decoupled from the backend codebase.
 * ------------------------------------------------------------------ */
export const THEMES = Object.freeze(['light', 'dark', 'system']);
export const FONT_SIZES = Object.freeze(['sm', 'md', 'lg']);
export const CONTENT_DENSITIES = Object.freeze(['compact', 'comfortable']);

/**
 * Default preferences applied when the user is signed-out (or while
 * `/auth/me` is still loading). Matches the server-side defaults so
 * the UI never flashes a different theme between guest and authed
 * states.
 */
export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  fontSize: 'md',
  contentDensity: 'comfortable',
  animations: true,
  enterToSend: true,
  showReadReceipts: true,
  showOnlineStatus: true,
  notifications: {
    browser: true,
    sound: true,
    muteAll: false,
  },
});

/* ------------------------------------------------------------------
 * Auth field rules
 *
 * Mirror the server-side validators (`server/utils/constants.js` +
 * `server/validators/auth.validator.js`) so the client can echo the
 * SAME constraints the API enforces. Duplicated rather than imported
 * so the bundle stays decoupled from the backend codebase — keep both
 * sides in sync when editing.
 *
 * SECURITY: these are UX-only previews. The server is always the
 * authority; never bypass server validation because a client check
 * passed.
 * ------------------------------------------------------------------ */
export const AUTH_RULES = Object.freeze({
  USERNAME_REGEX: /^[a-zA-Z0-9_]+$/,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  DISPLAY_NAME_MIN_LENGTH: 2,
  DISPLAY_NAME_MAX_LENGTH: 40,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_COMPLEXITY: /^(?=.*[A-Za-z])(?=.*\d).+$/,
});

/* ------------------------------------------------------------------
 * Conversation rules
 *
 * Mirror the server-side `server/utils/constants.js` so the UI can
 * enforce the same caps before paying for a round-trip rejection.
 * Keep both sides in sync when editing.
 * ------------------------------------------------------------------ */
export const GROUP_RULES = Object.freeze({
  NAME_MAX_LENGTH: 50,
  MAX_PARTICIPANTS: 100,
  AVATAR_MAX_SIZE_MB: 5,
});

/* ------------------------------------------------------------------
 * Notification system
 * ------------------------------------------------------------------ */
export const NOTIFICATION_SOUND_URL = '/notification-sound.mp3';

/**
 * Maximum number of in-memory notifications kept by `NotificationContext`.
 * Older entries are dropped from state (the server-side inbox still has
 * the full history via `listNotifications`).
 */
export const NOTIFICATION_BUFFER_SIZE = 20;
