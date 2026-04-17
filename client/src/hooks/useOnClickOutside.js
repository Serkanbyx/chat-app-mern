import { useEffect } from 'react';

/**
 * `useOnClickOutside(ref, handler)`
 *
 * Invokes `handler(event)` when a `mousedown` or `touchstart` happens
 * outside the element pointed to by `ref`. Used by every dismissable
 * overlay (dropdowns, emoji picker, context menu, profile popovers).
 *
 * Why `mousedown` instead of `click`?
 *   `click` fires AFTER mouseup, which means a click that started
 *   inside but ended outside (e.g. a drag) would close the menu —
 *   surprising UX. `mousedown` matches the "press to dismiss" mental
 *   model used by native menus.
 *
 * The listener is attached once per (ref, handler) pair and removed on
 * unmount, so there's no leak even if the consuming component lives
 * for the entire app lifetime.
 */
export function useOnClickOutside(ref, handler) {
  useEffect(() => {
    if (!handler) return undefined;

    const listener = (event) => {
      const el = ref.current;
      if (!el || el.contains(event.target)) return;
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener, { passive: true });
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
