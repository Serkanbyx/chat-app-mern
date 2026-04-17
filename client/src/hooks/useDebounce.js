import { useEffect, useState } from 'react';

/**
 * `useDebounce(value, ms = 300)`
 *
 * Returns a debounced copy of `value` that only updates after `ms`
 * milliseconds have elapsed without further changes. Used to throttle
 * expensive side-effects such as the global user search input
 * (`/api/users/search`) — typing "alice" should fire one network
 * request, not five.
 *
 * The cleanup function cancels the pending timer on every change,
 * which is what gives the hook its "trailing-edge only" behaviour.
 */
export function useDebounce(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}
