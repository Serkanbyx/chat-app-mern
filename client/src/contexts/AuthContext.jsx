import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import * as authService from '../api/auth.service.js';
import { ROUTES, STORAGE_KEYS } from '../utils/constants.js';

/**
 * AuthContext — single source of truth for "who is the current user?"
 *
 * Responsibilities:
 *   - Hydrate the session on first mount: if a JWT exists in
 *     localStorage we call `/auth/me` to validate it and fetch the
 *     full user document. A 401 here means the token has been revoked
 *     (account suspended, password changed elsewhere, etc.) so we
 *     transparently clear it and treat the user as a guest.
 *   - Expose imperative actions (`login`, `register`, `logout`,
 *     `updateUser`, `refresh`) that everything in the app — settings
 *     pages, sockets, notifications — funnel through.
 *   - Drive post-auth navigation. We deliberately call `navigate()`
 *     here (not in pages) so every entry point (login form, register
 *     form, deep-link with stale token) ends up in the same place.
 *
 * Why a ref guards the bootstrap fetch:
 *   In React 18+ Strict Mode every effect runs twice in development.
 *   Without `bootstrappedRef`, the dev server would issue two parallel
 *   `/auth/me` calls and produce a brief race-condition flash.
 */

const AuthContext = createContext(null);

const readToken = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEYS.TOKEN);
};

const writeToken = (value) => {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(STORAGE_KEYS.TOKEN, value);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.TOKEN);
  }
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  // Stays `true` until the bootstrap `/auth/me` call settles. Route
  // guards check this so we don't redirect a logged-in user to /login
  // during the half-second it takes the server to reply.
  const [loading, setLoading] = useState(Boolean(readToken()));

  const bootstrappedRef = useRef(false);

  /**
   * Apply a successful login/register response: persist the token,
   * populate user state, and route into the app. Pulled out as a helper
   * so `login` and `register` cannot drift apart.
   */
  const applyAuthResult = useCallback(
    (result, { redirect = true } = {}) => {
      const nextToken = result?.data?.token ?? result?.token ?? null;
      const nextUser = result?.data?.user ?? result?.user ?? null;
      if (!nextToken || !nextUser) {
        throw new Error('Auth response missing token or user');
      }
      writeToken(nextToken);
      setToken(nextToken);
      setUser(nextUser);
      if (redirect) {
        navigate(ROUTES.CHAT, { replace: true });
      }
    },
    [navigate],
  );

  /* ---------- Imperative actions ---------- */

  const login = useCallback(
    async (email, password) => {
      const result = await authService.login({ email, password });
      applyAuthResult(result);
      return result;
    },
    [applyAuthResult],
  );

  const register = useCallback(
    async (payload) => {
      const result = await authService.register(payload);
      applyAuthResult(result);
      return result;
    },
    [applyAuthResult],
  );

  /**
   * Local logout — does NOT call a backend endpoint because JWTs are
   * stateless on the server. SocketContext watches `token` and tears
   * down its connection when it becomes `null`, so we never need to
   * reach into another context from here.
   */
  const logout = useCallback(
    ({ redirect = true } = {}) => {
      writeToken(null);
      setToken(null);
      setUser(null);
      if (redirect) {
        navigate(ROUTES.LOGIN, { replace: true });
      }
    },
    [navigate],
  );

  /**
   * Merge a partial user object into state — the standard shape used
   * by Settings pages, avatar uploads, and PreferencesContext after a
   * successful PATCH. Accepts a function for the rare case where a
   * caller needs the previous value to compute the next one (e.g.
   * appending to `blockedUsers`).
   */
  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = typeof partial === 'function' ? partial(prev) : { ...prev, ...partial };
      return next;
    });
  }, []);

  /**
   * Refetch the current user from the server. Used by Settings pages
   * after potentially server-driven changes (e.g. password change
   * doesn't touch user fields, but we still want to ensure no drift).
   */
  const refresh = useCallback(async () => {
    if (!readToken()) return null;
    try {
      const result = await authService.getMe();
      const nextUser = result?.data?.user ?? null;
      if (nextUser) setUser(nextUser);
      return nextUser;
    } catch (error) {
      // The axios 401 interceptor already redirects on auth failure;
      // we still null-out local state defensively in case the response
      // status was something else (network error, 5xx).
      if (error?.response?.status === 401) {
        logout({ redirect: false });
      }
      return null;
    }
  }, [logout]);

  /* ---------- Bootstrap on mount ---------- */
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const storedToken = readToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await authService.getMe();
        if (cancelled) return;
        const nextUser = result?.data?.user ?? null;
        if (nextUser) {
          setUser(nextUser);
        } else {
          // Defensive: server returned 200 but no user — treat as logout
          // rather than render with stale token.
          writeToken(null);
          setToken(null);
        }
      } catch (error) {
        if (cancelled) return;
        // 401 is the common case (revoked token); axios already cleared
        // localStorage. Any other error (network, 5xx) shouldn't kick a
        // user out, but without a verified user we still can't render
        // authenticated UI, so we treat the session as anonymous for
        // this load and let them retry by reloading.
        if (error?.response?.status === 401) {
          setToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Cross-tab sync ----------
   * If the user logs out in another tab, the `storage` event fires
   * here. Mirroring the change keeps every tab consistent without
   * polling. */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (event.key !== STORAGE_KEYS.TOKEN) return;
      if (event.newValue === null) {
        setToken(null);
        setUser(null);
      } else if (event.newValue !== token) {
        setToken(event.newValue);
        // We don't have the new user here; trigger a refresh.
        refresh();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [token, refresh]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      updateUser,
      refresh,
    }),
    [user, token, loading, login, register, logout, updateUser, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Consumer hook with a guard so a forgotten `<AuthProvider>` fails
 * loudly in development instead of returning `undefined` and producing
 * cryptic null-deref errors deep inside a component.
 */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
};

export default AuthContext;
