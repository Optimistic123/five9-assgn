import { useEffect, useRef, useState, type RefObject } from 'react';

const SCROLL_DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' ']);

interface Options {
  /** Distance from the bottom (px) that counts as "reached". Kept below one page's height. */
  threshold?: number;
  /** A pause in wheel/trackpad input at least this long ends a gesture. */
  gestureGapMs?: number;
}

/**
 * Calls `onReach` when the user scrolls `container` down to within `threshold` px of its bottom.
 *
 * - Only the user's own downward scrolling triggers it. Content arriving (or rows
 *   growing in via the row animation) never does, and neither does scrolling up.
 * - One page per scroll gesture. A gesture is a run of wheel/trackpad input with no
 *   pause of `gestureGapMs`; a touch, a key press or a scrollbar drag each start a new
 *   one, and momentum scrolling belongs to the gesture that started it. Pauses are
 *   measured on the input events' own timestamps, so a busy main thread (rendering a
 *   page that just arrived) can't split one gesture into two.
 * - The caller disables it while a page is loading. The listeners stay attached
 *   meanwhile, so a gesture that continues through a load is still recognised as one.
 *
 * Returns whether the container can scroll at all. If the rows don't fill it, the
 * user has nothing to scroll, so the caller should offer a button instead.
 */
export function useInfiniteScroll(
  container: RefObject<HTMLElement>,
  enabled: boolean,
  onReach: () => void,
  { threshold = 100, gestureGapMs = 250 }: Options = {},
): boolean {
  const [scrollable, setScrollable] = useState(true);
  const enabledRef = useRef(enabled);
  const onReachRef = useRef(onReach);
  enabledRef.current = enabled;
  onReachRef.current = onReach;

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let lastTop = el.scrollTop;
    let gesture = 0; // id of the current scroll gesture
    let usedGesture = -1; // gesture that already loaded a page
    let lastWheelAt = -Infinity;
    let touchStartY = 0;

    const tryLoad = () => {
      if (!enabledRef.current || usedGesture === gesture) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= threshold) {
        usedGesture = gesture;
        onReachRef.current();
      }
    };

    const onScroll = () => {
      const top = el.scrollTop;
      const scrollingDown = top > lastTop;
      lastTop = top;
      if (scrollingDown) tryLoad();
    };
    // At the very bottom, scrolling down produces no scroll event, so the input
    // itself must also be able to trigger a load (or the user would be stuck).
    const onWheel = (e: WheelEvent) => {
      if (e.timeStamp - lastWheelAt >= gestureGapMs) gesture++;
      lastWheelAt = e.timeStamp;
      if (e.deltaY > 0) tryLoad();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.repeat) gesture++;
      if (SCROLL_DOWN_KEYS.has(e.key)) tryLoad();
    };
    const onTouchStart = (e: TouchEvent) => {
      gesture++;
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      // Finger moving up = content scrolling down.
      if ((e.touches[0]?.clientY ?? touchStartY) < touchStartY - 10) tryLoad();
    };
    const onPointerDown = () => {
      gesture++; // e.g. grabbing the scrollbar
    };

    const listeners: [string, EventListener][] = [
      ['scroll', onScroll as EventListener],
      ['wheel', onWheel as EventListener],
      ['keydown', onKeyDown as EventListener],
      ['touchstart', onTouchStart as EventListener],
      ['touchmove', onTouchMove as EventListener],
      ['pointerdown', onPointerDown],
    ];
    listeners.forEach(([type, fn]) => el.addEventListener(type, fn, { passive: true }));
    return () => listeners.forEach(([type, fn]) => el.removeEventListener(type, fn));
  }, [container, threshold, gestureGapMs]);

  // Track whether the content overflows. One ResizeObserver for the container and
  // its children (re-attached when children change, e.g. placeholder -> table).
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollHeight > el.clientHeight);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const observeAll = () => {
      if (resize) {
        resize.disconnect();
        resize.observe(el);
        Array.from(el.children).forEach((child) => resize.observe(child));
      }
      measure();
    };
    observeAll();
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(observeAll);
    mutations?.observe(el, { childList: true });
    return () => {
      resize?.disconnect();
      mutations?.disconnect();
    };
  }, [container]);

  return scrollable;
}
