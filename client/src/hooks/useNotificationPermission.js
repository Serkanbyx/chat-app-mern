import { useCallback, useEffect, useState } from 'react';

/**
 * `useNotificationPermission()`
 *
 * Thin wrapper around the Web Notifications API permission state.
 * Returns `{ permission, request }` where:
 *   - `permission` ∈ 'granted' | 'denied' | 'default' | 'unsupported'
 *   - `request()` triggers the browser prompt (only valid from a user
 *     gesture handler — calling it on mount does nothing on Chrome/iOS).
 *
 * `'unsupported'` is a synthetic state we use when the API is missing
 * (older Safari, some embedded webviews) so consumers can branch
 * without poking at `window.Notification` themselves.
 */
export function useNotificationPermission() {
  const isSupported =
    typeof window !== 'undefined' && 'Notification' in window;

  const [permission, setPermission] = useState(
    isSupported ? Notification.permission : 'unsupported',
  );

  const request = useCallback(async () => {
    if (!isSupported) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  /**
   * The Permissions API exposes a live `change` event so we can react
   * if the user flips the site permission from the URL bar without
   * reloading the page. Not every browser ships it (Safari < 16),
   * hence the optional-chaining + try/catch guards.
   */
  useEffect(() => {
    if (!isSupported || !navigator.permissions?.query) return undefined;
    let status;
    let cancelled = false;
    const handler = () => {
      if (status && !cancelled) setPermission(status.state === 'prompt' ? 'default' : status.state);
    };

    navigator.permissions
      .query({ name: 'notifications' })
      .then((result) => {
        status = result;
        status.addEventListener('change', handler);
      })
      .catch(() => {
        /* noop — permission name unsupported in this browser */
      });

    return () => {
      cancelled = true;
      status?.removeEventListener('change', handler);
    };
  }, [isSupported]);

  return { permission, request, isSupported };
}
