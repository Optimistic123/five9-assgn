import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 150;
const HIDE_DELAY_MS = 120;
/** Must match the `popover-out` animation duration in App.css. */
const EXIT_MS = 120;
const VIEWPORT_GAP = 12;
const POPOVER_MIN_WIDTH = 320;
const POPOVER_MAX_WIDTH = 440;

type Phase = 'closed' | 'open' | 'closing';

interface Position {
  top: number;
  left: number;
  width: number;
  /** Rect of the trigger, used to flip the popover upward near the bottom of the viewport. */
  anchorBottom: number;
}

/**
 * Clamps text to `lines` lines. When the text is actually truncated, hovering or
 * focusing it opens a popover with the full text that animates up into place.
 *
 * The popover is portalled to <body> with fixed positioning so the table's
 * scroll container and the row animation's clipping can't cut it off. The full
 * text is always in the DOM for screen readers, so the popover is aria-hidden.
 */
export function TruncatedText({ text, lines = 3 }: { text: string; lines?: number }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const [truncated, setTruncated] = useState(false);
  const [phase, setPhase] = useState<Phase>('closed');
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, lines]);

  const clearTimer = () => window.clearTimeout(timer.current);

  const open = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(Math.max(rect.width + 32, POPOVER_MIN_WIDTH), POPOVER_MAX_WIDTH, vw - VIEWPORT_GAP * 2);
    const left = Math.min(Math.max(rect.left - 16, VIEWPORT_GAP), vw - width - VIEWPORT_GAP);
    // Overlay the clamped text so the popover reads as the cell expanding.
    setPosition({ top: rect.top - 12, left, width, anchorBottom: rect.bottom + 12 });
    setPhase('open');
  }, []);

  const close = useCallback(() => {
    setPhase((p) => (p === 'open' ? 'closing' : p));
    timer.current = window.setTimeout(() => setPhase('closed'), EXIT_MS);
  }, []);

  const scheduleOpen = () => {
    if (!truncated) return;
    clearTimer();
    timer.current = window.setTimeout(open, phase === 'closed' ? SHOW_DELAY_MS : 0);
  };

  const scheduleClose = () => {
    clearTimer();
    timer.current = window.setTimeout(close, HIDE_DELAY_MS);
  };

  // Flip upward if the popover would run off the bottom of the viewport.
  useLayoutEffect(() => {
    const pop = popoverRef.current;
    if (phase !== 'open' || !pop || !position) return;
    const height = pop.offsetHeight;
    if (position.top + height > window.innerHeight - VIEWPORT_GAP) {
      const top = Math.max(VIEWPORT_GAP, position.anchorBottom - height);
      if (top !== position.top) setPosition({ ...position, top });
    }
  }, [phase, position]);

  // Fixed-position popovers don't follow the page, so close on scroll/resize; Escape closes too.
  useEffect(() => {
    if (phase !== 'open') return;
    const dismiss = () => {
      clearTimer();
      close();
    };
    // Scrolling the popover's own long text must not close it.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      dismiss();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase, close]);

  useEffect(() => clearTimer, []);

  return (
    <>
      <p
        ref={textRef}
        className={`clamp${truncated ? ' is-truncated' : ''}`}
        style={{ '--lines': lines } as CSSProperties}
        tabIndex={truncated ? 0 : undefined}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
      >
        {text}
      </p>
      {phase !== 'closed' &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className={`popover${phase === 'closing' ? ' is-closing' : ''}`}
            style={{ top: position.top, left: position.left, width: position.width }}
            aria-hidden="true"
            data-testid="details-popover"
            onMouseEnter={clearTimer}
            onMouseLeave={scheduleClose}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
