import { QueryCache } from '../cache/queryCache';
import { watchQuery, type QueryResult } from '../cache/cacheAndNetwork';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('QueryCache', () => {
  it('stores, notifies subscribers and unsubscribes', () => {
    const cache = new QueryCache();
    const listener = vi.fn();
    const unsubscribe = cache.subscribe('k', listener);
    cache.set('k', 1);
    expect(cache.get('k')?.data).toBe(1);
    expect(listener).toHaveBeenCalledWith(1);
    unsubscribe();
    cache.set('k', 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates concurrent fetches for the same key', async () => {
    const cache = new QueryCache();
    const fetcher = vi.fn().mockResolvedValue('x');
    await Promise.all([cache.fetch('k', fetcher), cache.fetch('k', fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('hydrates from and persists to storage', () => {
    const storage = window.sessionStorage;
    storage.clear();
    new QueryCache(storage).set('k', { a: 1 });
    expect(new QueryCache(storage).get('k')?.data).toEqual({ a: 1 });
  });
});

describe('watchQuery (cache-and-network)', () => {
  it('network only on a cache miss', async () => {
    const cache = new QueryCache();
    const results: QueryResult<string>[] = [];
    watchQuery(cache, 'k', () => Promise.resolve('net'), (r) => results.push(r));
    await flush();
    expect(results).toEqual([
      { data: undefined, loading: true, fromCache: false },
      { data: 'net', loading: false, fromCache: false },
    ]);
  });

  it('emits cached data first, then always fetches and emits network data', async () => {
    const cache = new QueryCache();
    cache.set('k', 'cached');
    const fetcher = vi.fn().mockResolvedValue('fresh');
    const results: QueryResult<string>[] = [];
    watchQuery<string>(cache, 'k', fetcher, (r) => results.push(r));

    expect(results).toEqual([{ data: 'cached', loading: true, fromCache: true }]);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results[1]).toEqual({ data: 'fresh', loading: false, fromCache: false });
    expect(cache.get('k')?.data).toBe('fresh');
  });

  it('keeps cached data and reports the error when the network fails', async () => {
    const cache = new QueryCache();
    cache.set('k', 'cached');
    const results: QueryResult<string>[] = [];
    watchQuery(cache, 'k', () => Promise.reject(new Error('boom')), (r) => results.push(r));
    await flush();
    expect(results[1]).toMatchObject({ data: 'cached', loading: false, error: new Error('boom') });
  });

  it('stops emitting after unsubscribe', async () => {
    const cache = new QueryCache();
    const onResult = vi.fn();
    const stop = watchQuery(cache, 'k', () => Promise.resolve('net'), onResult);
    stop();
    await flush();
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
