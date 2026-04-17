import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { useAuth } from './AuthContext.jsx';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { updatePreferences as updatePreferencesService } from '../api/user.service.js';
import { DEFAULT_PREFERENCES, STORAGE_KEYS } from '../utils/constants.js';

/**
 * PreferencesContext — applies user UI preferences to <html> and
 * exposes an `updatePreference` action that persists changes server-side.
 *
 * Source-of-truth strategy:
 *   - Authenticated users: `user.preferences` from AuthContext is the
 *     canonical store. Local edits flow through `updatePreference`,
 *     which optimistically merges into `user.preferences` via
 *     `updateUser` AND fires the API call. On failure the optimistic
 *     change is rolled back to keep UI and DB consistent.
 *   - Guests (no `user`): fall back to a `localStorage`-backed copy so
 *     the landing/login pages can still respect the user's chosen
 *     theme without an account.
 *
 * The applier effects below read from a single derived `preferences`
 * object so toggling between guest/auth modes never strands a class on
 * `<html>` (e.g. leaving `dark` after logout when the user's system
 * pref is light).
 */

const PreferencesContext = createContext(null);

/* ------------------------------------------------------------------
 * DOM appliers — pure functions split out so they're trivial to unit
 * test (give them a class list, expect a different class list).
 * ------------------------------------------------------------------ */

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // 'system' — defer to the OS-level preference. The matchMedia
    // listener below keeps us in sync if it changes at runtime.
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', Boolean(prefersDark));
  }
};

const applyFontSize = (size) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('fs-sm', 'fs-md', 'fs-lg');
  root.classList.add(`fs-${size}`);
};

const applyDensity = (density) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('density-compact', 'density-comfortable');
  root.classList.add(`density-${density}`);
};

const applyAnimations = (animations) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('no-anim', animations === false);
};

/**
 * Set a deep-ish path on a preferences object. We only need depth-2
 * (`notifications.browser`, `notifications.sound`, …), so this does
 * NOT pretend to be Lodash — keeping it small avoids the surface area
 * for prototype-pollution-style bugs.
 */
const setByPath = (obj, path, value) => {
  const keys = path.split('.');
  if (keys.length === 1) {
    return { ...obj, [keys[0]]: value };
  }
  if (keys.length === 2) {
    const [outer, inner] = keys;
    return {
      ...obj,
      [outer]: { ...(obj?.[outer] ?? {}), [inner]: value },
    };
  }
  throw new Error(`Unsupported preference path depth: ${path}`);
};

const getByPath = (obj, path) => {
  const keys = path.split('.');
  return keys.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
};

export const PreferencesProvider = ({ children }) => {
  const { user, updateUser } = useAuth();

  const [guestPreferences, setGuestPreferences] = useLocalStorage(
    STORAGE_KEYS.GUEST_PREFERENCES,
    DEFAULT_PREFERENCES,
  );

  /* Derived current preferences. We spread DEFAULT_PREFERENCES first
   * so a partially-stored user (older account, missing newer fields)
   * still gets sensible defaults for the missing keys. */
  const preferences = useMemo(() => {
    const source = user?.preferences ?? guestPreferences ?? DEFAULT_PREFERENCES;
    return {
      ...DEFAULT_PREFERENCES,
      ...source,
      notifications: {
        ...DEFAULT_PREFERENCES.notifications,
        ...(source?.notifications ?? {}),
      },
    };
  }, [user, guestPreferences]);

  /* ---------- Apply effects ---------- */
  useEffect(() => {
    applyTheme(preferences.theme);

    // 'system' is the only case that needs a live listener — for
    // 'light'/'dark' the user's choice already wins.
    if (preferences.theme !== 'system') return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    // Both shapes for cross-browser support; Safari < 14 used the
    // deprecated addListener API.
    if (media.addEventListener) {
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, [preferences.theme]);

  useEffect(() => {
    applyFontSize(preferences.fontSize);
  }, [preferences.fontSize]);

  useEffect(() => {
    applyDensity(preferences.contentDensity);
  }, [preferences.contentDensity]);

  useEffect(() => {
    applyAnimations(preferences.animations);
  }, [preferences.animations]);

  /* ---------- Mutator ----------
   *
   * `updatePreference('notifications.sound', false)` — the path API
   * keeps callers from having to reconstruct the entire preferences
   * object every time they flip a switch.
   */
  const updatePreference = useCallback(
    async (path, value) => {
      const previousValue = getByPath(preferences, path);
      const optimistic = setByPath(preferences, path, value);

      // 1. Optimistic update.
      if (user) {
        updateUser({ preferences: optimistic });
      } else {
        setGuestPreferences(optimistic);
      }

      // 2. Persist if authenticated. Guests have no server row to update.
      if (!user) return optimistic;

      try {
        // Send only the changed slice — the server's allow-list
        // validator rejects unknown keys, so this also keeps the
        // payload from accidentally introducing new fields.
        const patch = setByPath({}, path, value);
        const result = await updatePreferencesService(patch);

        // Trust the server response (it may merge / coerce values).
        const persisted = result?.data?.preferences ?? optimistic;
        updateUser({ preferences: persisted });
        return persisted;
      } catch (error) {
        // Roll back on failure so the UI doesn't show a setting that
        // didn't actually save. Toast logging happens in the calling
        // component (Settings page) — context stays UI-agnostic.
        const rolledBack = setByPath(preferences, path, previousValue);
        updateUser({ preferences: rolledBack });
        throw error;
      }
    },
    [preferences, user, updateUser, setGuestPreferences],
  );

  const value = useMemo(
    () => ({ preferences, updatePreference }),
    [preferences, updatePreference],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a <PreferencesProvider>');
  }
  return ctx;
};

export default PreferencesContext;
