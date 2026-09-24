import type { QueryCache } from './queryCache';

export interface QueryResult<T> {
  data?: T;
  /** A network request for this query is in flight. */
  loading: boolean;
  /** `data` came from the cache and a network refresh is pending. */
  fromCache: boolean;
  error?: Error;
}

/**
 * Apollo `cache-and-network` fetch policy:
 *  1. If the cache has data for `key`, emit it immediately (while still loading).
 *  2. Always send the network request.
 *  3. When it resolves, write it to the cache and emit the fresh data.
 *  4. If it fails, emit the error alongside any cached data.
 *
 * Also stays subscribed so any later cache write for `key` is emitted.
 * Returns an unsubscribe function.
 */
export function watchQuery<T>(
  cache: QueryCache,
  key: string,
  fetcher: () => Promise<T>,
  onResult: (result: QueryResult<T>) => void,
): () => void {
  let active = true;
  const cached = cache.get<T>(key);

  onResult({ data: cached?.data, loading: true, fromCache: cached !== undefined });

  const unsubscribe = cache.subscribe<T>(key, (data) => {
    if (active) onResult({ data, loading: false, fromCache: false });
  });

  cache.fetch(key, fetcher).catch((err: unknown) => {
    if (!active) return;
    onResult({
      data: cache.get<T>(key)?.data,
      loading: false,
      fromCache: cache.get<T>(key) !== undefined,
      error: err instanceof Error ? err : new Error(String(err)),
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
