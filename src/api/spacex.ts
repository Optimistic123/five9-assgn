import type { LaunchPage, Rocket } from './types';
import { mockLaunchesPage, mockRockets } from '../mock/mockApi';

export const API_BASE = 'https://api.spacexdata.com/v4';
export const PAGE_SIZE = 3;
const REQUEST_TIMEOUT_MS = 8000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`SpaceX API responded with HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    // Network/CORS failures surface as an opaque TypeError ("Failed to fetch").
    if (err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new Error('Could not reach the SpaceX API. It may be down — please try again later.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Set once a live request fails. From then on this session is served from the
 * bundled snapshot, so we don't keep firing requests at a down API and every
 * page of a list comes from the same dataset. Reloading the page retries live.
 */
let liveApiDown = false;

/** Test hook: forget a previous live API failure. */
export function resetLiveApiStatus(): void {
  liveApiDown = false;
}

/** Use the live SpaceX API; if it is unreachable, fall back to the offline snapshot. */
async function liveOrSnapshot<T>(live: () => Promise<T>, snapshot: () => Promise<T>): Promise<T> {
  if (liveApiDown) return snapshot();
  try {
    return await live();
  } catch (err) {
    liveApiDown = true;
    console.warn('[spacex] live API unavailable, using offline snapshot:', err);
    return snapshot();
  }
}

interface QueryResponse extends Omit<LaunchPage, 'source'> {}

export function fetchRockets(): Promise<Rocket[]> {
  return liveOrSnapshot(async () => {
    const rockets = await request<Rocket[]>('/rockets');
    return rockets.map(({ id, name }) => ({ id, name }));
  }, mockRockets);
}

export function fetchLaunchesPage(rocketId: string | null, page: number): Promise<LaunchPage> {
  return liveOrSnapshot(
    async () => {
      const res = await request<QueryResponse>('/launches/query', {
        method: 'POST',
        body: JSON.stringify({
          query: rocketId ? { rocket: rocketId } : {},
          options: {
            page,
            limit: PAGE_SIZE,
            sort: { date_utc: 'desc' },
            select: { name: 1, date_utc: 1, details: 1, rocket: 1, 'links.patch.small': 1 },
            populate: [{ path: 'rocket', select: { name: 1 } }],
          },
        }),
      });
      const { docs, page: current, totalPages, hasNextPage } = res;
      return { docs, page: current, totalPages, hasNextPage, source: 'live' };
    },
    () => mockLaunchesPage(rocketId, page, PAGE_SIZE),
  );
}
