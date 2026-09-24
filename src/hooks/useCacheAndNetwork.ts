import { useEffect, useRef, useState } from 'react';
import { queryCache as defaultCache, type QueryCache } from '../cache/queryCache';
import { watchQuery, type QueryResult } from '../cache/cacheAndNetwork';

/** React binding for a single query using the cache-and-network policy. */
export function useCacheAndNetwork<T>(
  key: string,
  fetcher: () => Promise<T>,
  cache: QueryCache = defaultCache,
): QueryResult<T> {
  const [result, setResult] = useState<QueryResult<T>>({ loading: true, fromCache: false });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(
    () => watchQuery(cache, key, () => fetcherRef.current(), setResult),
    [cache, key],
  );

  return result;
}
