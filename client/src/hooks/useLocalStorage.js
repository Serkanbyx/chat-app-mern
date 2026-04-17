import { useCallback, useEffect, useState } from 'react';

/**
 * `useLocalStorage(key, initial)`
 *
 * A `useState`-shaped hook whose value is mirrored to `localStorage`.
 *
 * Implementation notes:
 *   - The lazy `useState` initializer reads storage exactly once on
 *     mount, avoiding an unnecessary parse on every re-render.
 *   - All `JSON.parse`/`stringify` calls are wrapped in try/catch so a
 *     corrupt entry (manual edit, shared origin, etc.) falls back to
 *     `initial` instead of throwing during render.
 *   - The `storage` event listener keeps tabs in sync: if the user
 *     toggles a setting in another tab, this tab updates without a
 *     reload.
 *   - SSR-safety: every `window` access is guarded so the same module
 *     can be imported by Vitest (jsdom) or future SSR setups.
 */
export function useLocalStorage(key, initial) {
  const readValue = useCallback(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  }, [key, initial]);

  const [value, setValue] = useState(readValue);

  const setStored = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          }
        } catch {
          /* Quota exceeded or storage disabled — keep React state
           * consistent so the UI still works in private mode. */
        }
        return resolved;
      });
    },
    [key],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (event.key !== key || event.storageArea !== window.localStorage) return;
      try {
        setValue(event.newValue === null ? initial : JSON.parse(event.newValue));
      } catch {
        setValue(initial);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key, initial]);

  return [value, setStored];
}
