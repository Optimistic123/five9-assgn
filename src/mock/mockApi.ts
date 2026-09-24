import snapshot from './spacexSnapshot.json';
import type { Launch, LaunchPage, Rocket } from '../api/types';

/**
 * Offline stand-in for the SpaceX v4 API, backed by an archived snapshot of
 * /v4/launches and /v4/rockets. Used only when the live API is unreachable.
 * It reproduces the subset of `/v4/launches/query` the app relies on:
 * filter by rocket, sort by date desc, paginate, populate rocket name.
 */
interface RawLaunch extends Omit<Launch, 'rocket'> {
  rocket: string;
}

const rockets: Rocket[] = snapshot.rockets;
const rawLaunches = snapshot.launches as RawLaunch[];
const rocketById = new Map(rockets.map((r) => [r.id, r]));

const SIMULATED_LATENCY_MS = 400;
const delay = <T>(value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));

export function mockRockets(): Promise<Rocket[]> {
  return delay(rockets.map((r) => ({ ...r })));
}

export function mockLaunchesPage(
  rocketId: string | null,
  page: number,
  limit: number,
): Promise<LaunchPage> {
  const matching = rawLaunches
    .filter((l) => !rocketId || l.rocket === rocketId)
    .sort((a, b) => b.date_utc.localeCompare(a.date_utc));
  const totalPages = Math.max(1, Math.ceil(matching.length / limit));
  const docs: Launch[] = matching.slice((page - 1) * limit, page * limit).map((l) => ({
    ...l,
    rocket: rocketById.get(l.rocket) ?? { id: l.rocket, name: 'Unknown' },
  }));
  return delay({ docs, page, totalPages, hasNextPage: page < totalPages, source: 'snapshot' });
}
