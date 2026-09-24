import { useEffect, type RefObject } from 'react';

interface Options {
  /** Scroll container to observe within; defaults to the viewport. */
  root?: RefObject<Element>;
  /** Look-ahead so the next page starts loading before the sentinel is visible. */
  rootMargin?: string;
}

/**
 * Calls `onReach` once when `target` scrolls into view, then stops observing.
 * The observer is rebuilt whenever `enabled` flips back on, so if the sentinel is
 * still visible after a page loads, the next page is requested immediately.
 */
export function useInfiniteScroll(
  target: RefObject<Element>,
  enabled: boolean,
  onReach: () => void,
  { root, rootMargin = '200px' }: Options = {},
): void {
  useEffect(() => {
    const el = target.current;
    if (!enabled || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        // Fire once per enable; the caller re-enables after the page has loaded.
        observer.disconnect();
        onReach();
      },
      { root: root?.current ?? null, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, root, enabled, onReach, rootMargin]);
}
