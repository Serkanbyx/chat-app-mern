import { useEffect, useRef } from 'react';

/**
 * `useInfiniteScroll(onLoadMore, { hasMore, rootMargin = '200px' })`
 *
 * Returns a `sentinelRef` to render at the BOUNDARY of the list (top
 * for "load older messages", bottom for paginated feeds). When the
 * sentinel scrolls into view, `onLoadMore` fires once.
 *
 * Why IntersectionObserver and not a `scroll` listener?
 *   - O(1) instead of O(n) per scroll tick.
 *   - Works correctly inside arbitrary scroll containers via the
 *     `root` option (defaulting to viewport here is fine because
 *     our message list IS the viewport-sized scroll container).
 *   - No throttle/rAF dance — the browser batches notifications.
 *
 * Re-entrancy guard (`loadingRef`) prevents the same intersection from
 * triggering multiple `onLoadMore` calls while the previous fetch is
 * still in flight. The consumer is responsible for setting `hasMore`
 * to `false` when the dataset is exhausted.
 */
export function useInfiniteScroll(onLoadMore, { hasMore = true, rootMargin = '200px' } = {}) {
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting || loadingRef.current) return;

        loadingRef.current = true;
        try {
          await onLoadMore();
        } finally {
          loadingRef.current = false;
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, rootMargin]);

  return sentinelRef;
}
