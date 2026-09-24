import { useEffect, useRef, useState, type RefObject } from 'react';

const SCROLL_DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' ']);

interface Options {
  /** Distance from the bottom (px) that counts as "reached". Kept below one page's height. */
  threshold?: number;
  /** A pause in wheel/trackpad input at least this long ends a gesture. */
  gestureGapMs?: number;
  /**
   * Safety net: if the user is still scrolling down at the bottom this long after the
   * last page arrived, load the next one even if no new gesture was detected.
   */
  maxGestureMs?: number;
}

/** A new trackpad swipe during momentum: input had decayed below this share of its peak... */
const MOMENTUM_DECAY = 0.6;
/** ...and then jumped up by at least this factor (and this many px). */
const NEW_SWIPE_JUMP = 1.8;
const NEW_SWIPE_MIN_PX = 6;

/**
 * Calls `onReach` when the user scrolls `container` down to within `threshold` px of its bottom.
 *
 * - Only the user's own downward scrolling triggers it. Content arriving (or rows
 *   growing in via the row animation) never does, and neither does scrolling up.
 * - One page per scroll gesture. A gesture is a run of wheel/trackpad input that ends
 *   at a pause of `gestureGapMs` or when a new trackpad swipe starts during the previous
 *   one's momentum. A touch, a key press or a scrollbar drag each start a new one.
 *   Pauses are measured on the input events' own timestamps, so a busy main thread
 *   (rendering a page that just arrived) can't split one gesture into two.
 * - It can't get stuck: still scrolling down at the bottom `maxGestureMs` after the last
 *   page arrived loads the next one even without a detected new gesture.
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
  { threshold = 100, gestureGapMs = 250, maxGestureMs = 1500 }: Options = {},
): boolean {
  const [scrollable, setScrollable] = useState(true);
  const enabledRef = useRef(enabled);
  const onReachRef = useRef(onReach);
  const enabledAt = useRef(0);
  enabledRef.current = enabled;
  onReachRef.current = onReach;

  // When loading becomes possible again (a page just arrived).
  useEffect(() => {
    if (enabled) enabledAt.current = performance.now();
  }, [enabled]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let lastTop = el.scrollTop;
    let gesture = 0; // id of the current scroll gesture
    let usedGesture = -1; // gesture that already loaded a page
    let lastWheelAt = -Infinity;
    let lastDelta = 0;
    let peakDelta = 0;
    let sidewaysInput = false; // the latest wheel input was mostly horizontal
    let touchStartX = 0;
    let touchStartY = 0;

    /** `at`: when the input happened (an input event's own timestamp where there is one). */
    const tryLoad = (at = performance.now()) => {
      if (!enabledRef.current) return;
      const sameGesture = usedGesture === gesture;
      if (sameGesture && at - enabledAt.current < maxGestureMs) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= threshold) {
        usedGesture = gesture;
        onReachRef.current();
      }
    };

    const onScroll = () => {
      const top = el.scrollTop;
      const scrollingDown = top > lastTop;
      lastTop = top;
      // A sideways swipe's slight vertical drift can move the list down a little.
      if (scrollingDown && !sidewaysInput) tryLoad();
    };
    // At the very bottom, scrolling down produces no scroll event, so the input
    // itself must also be able to trigger a load (or the user would be stuck).
    const onWheel = (e: WheelEvent) => {
      // Horizontal scrolling (e.g. a sideways trackpad swipe, which usually drifts a
      // little vertically too) is not a request for more rows.
      sidewaysInput = Math.abs(e.deltaX) >= Math.abs(e.deltaY);
      if (sidewaysInput) return;
      const delta = Math.abs(e.deltaY) * (e.deltaMode === 1 ? 16 : 1); // lines -> px
      const paused = e.timeStamp - lastWheelAt >= gestureGapMs;
      // Trackpad momentum keeps sending input after the fingers lift, so a new swipe
      // often starts with no pause at all. Momentum only ever decays; a new swipe
      // makes the deltas jump back up.
      const newSwipe =
        lastDelta < peakDelta * MOMENTUM_DECAY && delta > lastDelta * NEW_SWIPE_JUMP && delta >= NEW_SWIPE_MIN_PX;
      if (paused || newSwipe) {
        gesture++;
        peakDelta = delta;
      } else {
        peakDelta = Math.max(peakDelta, delta);
      }
      lastDelta = delta;
      lastWheelAt = e.timeStamp;
      if (e.deltaY > 0) tryLoad(e.timeStamp);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      sidewaysInput = false;
      if (!e.repeat) gesture++;
      if (SCROLL_DOWN_KEYS.has(e.key)) tryLoad(e.timeStamp);
    };
    const onTouchStart = (e: TouchEvent) => {
      sidewaysInput = false;
      gesture++;
      touchStartX = e.touches[0]?.clientX ?? 0;
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Finger moving up = content scrolling down; ignore mostly-sideways swipes.
      const up = touchStartY - touch.clientY;
      if (up > 10 && up > Math.abs(touch.clientX - touchStartX)) tryLoad(e.timeStamp);
    };
    const onPointerDown = () => {
      sidewaysInput = false;
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
  }, [container, threshold, gestureGapMs, maxGestureMs]);

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
