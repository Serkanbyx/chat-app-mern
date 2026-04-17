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
 * Notification system
 * ------------------------------------------------------------------ */
export const NOTIFICATION_SOUND_URL = '/notification-sound.mp3';

/**
 * Maximum number of in-memory notifications kept by `NotificationContext`.
 * Older entries are dropped from state (the server-side inbox still has
 * the full history via `listNotifications`).
 */
export const NOTIFICATION_BUFFER_SIZE = 20;
