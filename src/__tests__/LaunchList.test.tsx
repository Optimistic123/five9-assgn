import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LaunchList, BUTTON_PAGE_LIMIT } from '../components/LaunchList';
import { queryCache } from '../cache/queryCache';
import type { LaunchPage } from '../api/types';
import * as api from '../api/spacex';

const TOTAL_PAGES = 13;

function page(n: number): LaunchPage {
  return {
    docs: [1, 2, 3].map((i) => ({
      id: `${n}-${i}`,
      name: `Mission ${n}-${i}`,
      date_utc: '2020-01-01T00:00:00.000Z',
      details: null,
      rocket: { id: 'r1', name: 'Falcon 9' },
      links: { patch: { small: null } },
    })),
    page: n,
    totalPages: TOTAL_PAGES,
    hasNextPage: n < TOTAL_PAGES,
    source: 'live',
  };
}

// jsdom has no layout: fake a scrollable table region and drive its scroll position.
// `now` is the timestamp given to wheel events, which is how gestures are told apart.
let scrollHeight = 2000;
let scrollTop = 0;
let now = 0;
const CLIENT_HEIGHT = 500;
const bottom = () => scrollHeight - CLIENT_HEIGHT;
const scroller = () => document.querySelector('.table-scroll') as HTMLElement;
function setScroll(top: number) {
  scrollTop = top;
  act(() => {
    scroller().dispatchEvent(new Event('scroll'));
  });
}
/** One wheel "notch" at the current time; the scroll it causes is dispatched separately. */
function wheel(deltaY = 30, deltaX = 0) {
  const e = new WheelEvent('wheel', { deltaY, deltaX });
  Object.defineProperty(e, 'timeStamp', { value: now });
  scroller().dispatchEvent(e);
}
/** A new downward wheel gesture (after a pause) that reaches the bottom. */
function scrollDownToBottom() {
  now += 1000;
  setScroll(0);
  wheel();
  setScroll(bottom());
}

beforeEach(() => {
  queryCache.clear();
  scrollHeight = 2000;
  scrollTop = 0;
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => CLIENT_HEIGHT);
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => scrollTop);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function loadButtonPages(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Mission 1-1');
  for (let n = 2; n <= BUTTON_PAGE_LIMIT; n++) {
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText(`Mission ${n}-3`);
  }
}

describe('LaunchList paging', () => {
  it('loads 3 per page via the button for 10 pages, then switches to infinite scroll', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);

    expect(await screen.findByText('Mission 1-1')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
    await loadButtonPages(user);
    expect(screen.getAllByRole('row')).toHaveLength(1 + 30);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByText('Scroll for more')).toBeInTheDocument();

    scrollDownToBottom();
    expect(await screen.findByText('Mission 11-1')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(null, 11);

    scrollDownToBottom();
    await screen.findByText('Mission 12-1');
    scrollDownToBottom();
    await screen.findByText('Mission 13-1');
    expect(await screen.findByText(/every launch/)).toBeInTheDocument();
  });

  it('renders cached rows immediately, then replaces them with network data', async () => {
    const cached = page(1);
    cached.docs[0] = { ...cached.docs[0], name: 'Stale mission' };
    queryCache.set('launches:r1:1', cached);

    let resolve!: (p: LaunchPage) => void;
    vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(
      () => new Promise<LaunchPage>((r) => (resolve = r)),
    );
    render(<LaunchList rocketId="r1" />);

    expect(screen.getByText('Stale mission')).toBeInTheDocument();
    expect(screen.getByText(/refreshing/)).toBeInTheDocument();

    await act(async () => resolve(page(1)));
    await waitFor(() => expect(screen.queryByText('Stale mission')).not.toBeInTheDocument());
    expect(screen.getByText('Mission 1-1')).toBeInTheDocument();
    expect(screen.queryByText(/refreshing/)).not.toBeInTheDocument();
  });
});

describe('LaunchList errors', () => {
  it('shows the error and retries the failed page', async () => {
    const spy = vi
      .spyOn(api, 'fetchLaunchesPage')
      .mockRejectedValueOnce(new Error('SpaceX API responded with HTTP 525'))
      .mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);

    expect(await screen.findByText(/HTTP 525/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Mission 1-1')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('LaunchList infinite scroll', () => {
  const requestedAfterButton = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(([, n]) => n as number).filter((n) => n > BUTTON_PAGE_LIMIT);

  it('does not load on its own after the 10th page, even when already at the bottom', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    scrollTop = bottom(); // user clicked "Load more" at the bottom
    await loadButtonPages(user);

    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(requestedAfterButton(spy)).toEqual([]);
    expect(screen.getByText('page 10', { exact: false })).toBeInTheDocument();

    scrollDownToBottom();
    await screen.findByText('Mission 11-3');
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(requestedAfterButton(spy)).toEqual([11]);
  });

  it('requests one page at a time even with rapid scroll events', async () => {
    const pending: ((p: LaunchPage) => void)[] = [];
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) =>
      n <= BUTTON_PAGE_LIMIT ? page(n) : new Promise<LaunchPage>((r) => pending.push(r)),
    );
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);

    // Several scroll events before React re-renders, then more while page 11 is in flight.
    now += 1000;
    act(() => {
      for (let i = 1; i <= 5; i++) {
        scrollTop = bottom() - 50 + i * 10;
        scroller().dispatchEvent(new Event('scroll'));
      }
    });
    scrollDownToBottom();
    await waitFor(() => expect(requestedAfterButton(spy)).toEqual([11]));

    // Only after page 11 arrives can page 12 be requested.
    await act(async () => pending[0](page(11)));
    await screen.findByText('Mission 11-3');
    scrollDownToBottom();
    await waitFor(() => expect(requestedAfterButton(spy)).toEqual([11, 12]));
  });

  it('keeps the Load more button when the rows do not fill the table area', async () => {
    scrollHeight = 400; // shorter than the 500px viewport: nothing to scroll
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Mission 11-3');
    expect(requestedAfterButton(spy)).toEqual([11]);
  });

  it('does not load when scrolling up near the bottom', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);
    scrollDownToBottom();
    await screen.findByText('Mission 11-3');

    now += 1000;
    wheel(-30); // a new gesture...
    setScroll(bottom() - 60); // ...scrolling up, still within the trigger zone
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(requestedAfterButton(spy)).toEqual([11]);
  });

  it('loads one page per scroll gesture even when later pages are cached', async () => {
    for (let n = 1; n <= TOTAL_PAGES; n++) queryCache.set(`launches:all:${n}`, page(n));
    // Background refreshes never resolve, so everything shown comes from the cache.
    vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(() => new Promise<LaunchPage>(() => {}));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);

    // One continuous flick: wheel input every 16 ms, scrolling down inside the trigger zone.
    now += 1000;
    for (let i = 1; i <= 10; i++) {
      now += 16;
      wheel();
      setScroll(bottom() - 100 + i * 10);
    }
    await screen.findByText('Mission 11-3');
    expect(screen.queryByText('Mission 12-1')).not.toBeInTheDocument();

    // A new gesture (after a pause) loads the next one.
    scrollDownToBottom();
    expect(await screen.findByText('Mission 12-1')).toBeInTheDocument();
    expect(screen.queryByText('Mission 13-1')).not.toBeInTheDocument();
  });

  it('does not load a second page when one gesture continues through a slow load', async () => {
    const pending: ((p: LaunchPage) => void)[] = [];
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) =>
      n <= BUTTON_PAGE_LIMIT ? page(n) : new Promise<LaunchPage>((r) => pending.push(r)),
    );
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);

    // Wheel input every 16 ms: trigger page 11, let it arrive mid-gesture, keep going.
    now += 1000;
    let top = bottom() - 100;
    const tick = () => {
      now += 16;
      top += 5;
      wheel();
      setScroll(top);
    };
    for (let i = 0; i < 5; i++) tick();
    expect(requestedAfterButton(spy)).toEqual([11]);
    await act(async () => pending[0](page(11)));
    await screen.findByText('Mission 11-3');
    for (let i = 0; i < 10; i++) tick();
    expect(requestedAfterButton(spy)).toEqual([11]);

    // After a pause, a new gesture loads page 12.
    scrollDownToBottom();
    await waitFor(() => expect(requestedAfterButton(spy)).toEqual([11, 12]));
  });

  it('loads on a new wheel gesture when already at the very bottom (no scroll event possible)', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);
    scrollDownToBottom();
    await screen.findByText('Mission 11-3');

    // Same gesture keeps wheeling at the bottom: nothing more.
    now += 16;
    wheel();
    expect(requestedAfterButton(spy)).toEqual([11]);

    // After a pause, a new wheel-down at the bottom loads the next page, with no scroll event.
    now += 1000;
    act(() => wheel());
    await waitFor(() => expect(requestedAfterButton(spy)).toEqual([11, 12]));
  });

  it('loads one page per trackpad swipe even when swipes run into each other (no pause)', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);
    scrollTop = bottom(); // already at the very bottom (no scroll event): wheel input alone must trigger

    // A swipe ramps up then decays (momentum); the next starts before it ends.
    const swipe = [4, 12, 26, 38, 42, 36, 30, 25, 21, 17, 14, 11, 9, 7, 6, 5, 4, 3];
    now += 1000;
    for (let s = 1; s <= 3; s++) {
      for (const dy of swipe) {
        now += 16;
        act(() => wheel(dy));
      }
      await screen.findByText(`Mission ${10 + s}-3`);
      expect(requestedAfterButton(spy)).toHaveLength(s);
    }
    expect(requestedAfterButton(spy)).toEqual([11, 12, 13]);
  });

  it('never stays stuck: keeps loading if scrolling down continues well after a page arrived', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);
    scrollTop = bottom(); // already at the very bottom, without a scroll event

    // Steady input with no pauses and no new-swipe pattern (one long gesture).
    now += 1000;
    const steady = async (ms: number) => {
      for (let t = 0; t < ms; t += 16) {
        now += 16;
        act(() => wheel(10));
      }
    };
    await steady(100);
    await screen.findByText('Mission 11-3');
    await steady(1000); // same gesture, shortly after the page arrived: nothing
    expect(requestedAfterButton(spy)).toEqual([11]);
    await steady(700); // now more than 1.5 s after page 11 arrived
    await waitFor(() => expect(requestedAfterButton(spy)).toEqual([11, 12]));
  });

  it('does not load on horizontal scrolling, even with a slight downward drift', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await loadButtonPages(user);
    scrollTop = bottom() - 40; // near the bottom, where a vertical wheel would load

    now += 1000;
    for (let i = 0; i < 20; i++) {
      now += 16;
      act(() => wheel(2, 30)); // sideways swipe drifting down...
      setScroll(bottom() - 40 + i * 2); // ...which also moves the list down a little
    }
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(requestedAfterButton(spy)).toEqual([]);

    // A vertical swipe right after still works.
    now += 16;
    act(() => wheel(30));
    await waitFor(() => expect(requestedAfterButton(spy)).toEqual([11]));
  });
});
