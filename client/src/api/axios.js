import axios from 'axios';

/**
 * Singleton Axios client used by every service module.
 *
 * Design choices that intentionally differ from the library defaults:
 *   - `withCredentials: false` — auth lives in the `Authorization` header,
 *     NOT in cookies. This eliminates the entire CSRF surface; the
 *     trade-off is XSS sensitivity, which we mitigate by never using
 *     `dangerouslySetInnerHTML` and escaping all user input on render.
 *   - `timeout: 15_000` — caps the worst-case "spinner forever" UX when
 *     the server hangs (slow Mongo, dead Cloudinary, etc.) without
 *     being so aggressive that legitimate uploads get killed.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: false,
  timeout: 15_000,
});

/**
 * Request interceptor — attaches the bearer token if one is stored.
 *
 * Reading from `localStorage` on every request (instead of caching the
 * token in a module-level variable) keeps multi-tab sessions in sync:
 * if the user logs out in another tab, the next request from this tab
 * sees `null` immediately rather than firing with a stale token.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor — global 401 handler.
 *
 * On any 401 we:
 *   1. Purge the token so subsequent requests don't retry with it.
 *   2. Hard-redirect to /login via `location.replace` (which also wipes
 *      React state) — but ONLY if the user isn't already on the login
 *      page, otherwise the failed login attempt would loop.
 *
 * `replace` (not `assign`) is used so the dead session doesn't pollute
 * the back-button history.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      const onLoginPage = window.location.pathname.startsWith('/login');
      if (!onLoginPage) {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  },
);

export default api;
