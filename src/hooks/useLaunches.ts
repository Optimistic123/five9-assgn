import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLaunchesPage } from '../api/spacex';
import type { Launch, LaunchPage } from '../api/types';
import { queryCache as defaultCache, type QueryCache } from '../cache/queryCache';
import { watchQuery, type QueryResult } from '../cache/cacheAndNetwork';

export const launchesKey = (rocketId: string | null, page: number) =>
  `launches:${rocketId ?? 'all'}:${page}`;

export interface UseLaunches {
  launches: Launch[];
  /** Number of pages requested so far. */
  pageCount: number;
  hasNextPage: boolean;
  loadingMore: boolean;
  /** Some visible rows are cached and being refreshed from the network. */
  refreshing: boolean;
  error?: Error;
  source?: LaunchPage['source'];
  loadMore: () => void;
  retry: () => void;
}

/**
 * Paged launch list for one rocket filter. Each page is its own cached query
 * (watched with cache-and-network) and the pages are concatenated in order.
 * Remount (e.g. via `key`) to reset when the filter changes.
 */
export function useLaunches(rocketId: string | null, cache: QueryCache = defaultCache): UseLaunches {
  const [pageCount, setPageCount] = useState(1);
  const [pages, setPages] = useState<Record<number, QueryResult<LaunchPage>>>({});
  const [attempt, setAttempt] = useState(0);
  const watchers = useRef(new Map<number, () => void>());
  // Highest page requested, updated synchronously. Scroll triggers can fire several
  // times before React re-renders, so the rendered `loadingMore` alone can't guard.
  const requested = useRef(1);

  // Start watching the newest requested page. Earlier pages stay watched so
  // their network refreshes still land after the user has paged further.
  useEffect(() => {
    const page = pageCount;
    if (watchers.current.has(page)) return;
    const stop = watchQuery(
      cache,
      launchesKey(rocketId, page),
      () => fetchLaunchesPage(rocketId, page),
      (result) => setPages((prev) => ({ ...prev, [page]: result })),
    );
    watchers.current.set(page, stop);
  }, [cache, rocketId, pageCount, attempt]);

  useEffect(() => {
    const map = watchers.current;
    return () => {
      map.forEach((stop) => stop());
      map.clear();
    };
  }, []);

  const launches: Launch[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const docs = pages[p]?.data?.docs;
    if (!docs) break;
    launches.push(...docs);
  }

  const last = pages[pageCount];
  const loadingMore = !last?.data && !last?.error;
  const hasNextPage = last?.data?.hasNextPage ?? false;
  const refreshing = Object.values(pages).some((p) => p.fromCache && p.loading);

  // One page at a time: the next page is requested only after the current one
  // has data (from cache or network) and says there is more.
  const loadMore = useCallback(() => {
    if (loadingMore || !hasNextPage || requested.current > pageCount) return;
    requested.current = pageCount + 1;
    setPageCount(pageCount + 1);
  }, [loadingMore, hasNextPage, pageCount]);

  const retry = useCallback(() => {
    watchers.current.get(pageCount)?.();
    watchers.current.delete(pageCount);
    setAttempt((n) => n + 1);
  }, [pageCount]);

  return {
    launches,
    pageCount,
    hasNextPage,
    loadingMore,
    refreshing,
    error: last?.error,
    source: pages[1]?.data?.source,
    loadMore,
    retry,
  };
}
