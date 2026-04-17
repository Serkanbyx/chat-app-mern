import { useEffect, useRef } from 'react';

/**
 * `useScrollToBottom(deps, { behavior = 'smooth', threshold = 120 })`
 *
 * Returns a `ref` to attach to the SCROLLABLE container (the message
 * list, not the page). Whenever any value in `deps` changes, the
 * container is auto-scrolled to the bottom — but only if the user was
 * already near the bottom (within `threshold` pixels). This prevents
 * the classic chat anti-pattern where reading older messages keeps
 * getting yanked away by every new arrival.
 *
 * The first effect run always scrolls (initial mount), so the freshly
 * opened conversation lands on the latest message.
 */
export function useScrollToBottom(deps = [], { behavior = 'smooth', threshold = 120 } = {}) {
  const ref = useRef(null);
  const isFirstRun = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const shouldStick = isFirstRun.current || distanceFromBottom <= threshold;

    if (shouldStick) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: isFirstRun.current ? 'auto' : behavior,
      });
    }

    isFirstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
