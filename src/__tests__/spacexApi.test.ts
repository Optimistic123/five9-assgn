import { fetchLaunchesPage, fetchRockets, resetLiveApiStatus } from '../api/spacex';

beforeEach(() => resetLiveApiStatus());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SpaceX API client', () => {
  it('uses the live API when it is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], page: 2, totalPages: 5, hasNextPage: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLaunchesPage('r1', 2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.spacexdata.com/v4/launches/query');
    const body = JSON.parse(init.body);
    expect(body.query).toEqual({ rocket: 'r1' });
    expect(body.options).toMatchObject({ page: 2, limit: 3, sort: { date_utc: 'desc' } });
    expect(result).toEqual({ docs: [], page: 2, totalPages: 5, hasNextPage: true, source: 'live' });
  });

  it('falls back to the snapshot when the API is down, and stops calling it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')); // CORS / 525
    vi.stubGlobal('fetch', fetchMock);

    const rockets = await fetchRockets();
    expect(rockets.map((r) => r.name)).toContain('Falcon 9');

    const falcon1 = rockets.find((r) => r.name === 'Falcon 1')!;
    const page1 = await fetchLaunchesPage(falcon1.id, 1);
    expect(page1.source).toBe('snapshot');
    expect(page1.docs).toHaveLength(3);
    expect(page1.docs.every((l) => l.rocket.name === 'Falcon 1')).toBe(true);
    const dates = page1.docs.map((l) => l.date_utc);
    expect([...dates].sort().reverse()).toEqual(dates);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back on an HTTP error status too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 525 }));
    expect((await fetchLaunchesPage(null, 1)).source).toBe('snapshot');
  });
});
