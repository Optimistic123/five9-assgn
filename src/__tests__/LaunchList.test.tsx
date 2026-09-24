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

// Controllable IntersectionObserver: tests call `scrollSentinelIntoView()`.
let observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
class MockIntersectionObserver {
  private entry: { cb: IntersectionObserverCallback; el?: Element };
  constructor(cb: IntersectionObserverCallback) {
    this.entry = { cb };
    observers.push(this.entry);
  }
  observe(el: Element) { this.entry.el = el; }
  disconnect() { observers = observers.filter((o) => o !== this.entry); }
  unobserve() {}
  takeRecords() { return []; }
}
function scrollSentinelIntoView() {
  act(() => {
    observers.forEach((o) =>
      o.cb([{ isIntersecting: true, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
  });
}

beforeEach(() => {
  queryCache.clear();
  observers = [];
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LaunchList paging', () => {
  it('loads 3 per page via the button for 10 pages, then switches to infinite scroll', async () => {
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) => page(n));
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);

    expect(await screen.findByText('Mission 1-1')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);

    for (let n = 2; n <= BUTTON_PAGE_LIMIT; n++) {
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByText(`Mission ${n}-3`);
    }
    expect(screen.getAllByRole('row')).toHaveLength(1 + 30);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('scroll-sentinel')).toBeInTheDocument();

    scrollSentinelIntoView();
    expect(await screen.findByText('Mission 11-1')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(null, 11);

    scrollSentinelIntoView();
    await screen.findByText('Mission 12-1');
    scrollSentinelIntoView();
    await screen.findByText('Mission 13-1');
    expect(await screen.findByText(/every launch/)).toBeInTheDocument();
    expect(screen.queryByTestId('scroll-sentinel')).not.toBeInTheDocument();
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
  it('requests one page at a time even if the sentinel fires repeatedly', async () => {
    const pending: ((p: LaunchPage) => void)[] = [];
    const spy = vi.spyOn(api, 'fetchLaunchesPage').mockImplementation(async (_r, n) =>
      n <= BUTTON_PAGE_LIMIT ? page(n) : new Promise<LaunchPage>((r) => pending.push(r)),
    );
    const user = userEvent.setup();
    render(<LaunchList rocketId={null} />);
    await screen.findByText('Mission 1-1');
    for (let n = 2; n <= BUTTON_PAGE_LIMIT; n++) {
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByText(`Mission ${n}-3`);
    }

    // Rapid scrolling: several intersections before React re-renders.
    act(() => {
      for (let i = 0; i < 3; i++) {
        observers.forEach((o) =>
          o.cb([{ isIntersecting: true, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver),
        );
      }
    });
    scrollSentinelIntoView(); // and again while page 11 is still in flight

    const requestedPages = () => spy.mock.calls.map(([, n]) => n).filter((n) => n > BUTTON_PAGE_LIMIT);
    await waitFor(() => expect(requestedPages()).toEqual([11]));

    // Only after page 11 arrives can page 12 be requested.
    await act(async () => pending[0](page(11)));
    await screen.findByText('Mission 11-3');
    scrollSentinelIntoView();
    await waitFor(() => expect(requestedPages()).toEqual([11, 12]));
  });
});
