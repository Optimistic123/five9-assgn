interface CacheEntry<T = unknown> {
  data: T;
  updatedAt: number;
}

type Listener<T = unknown> = (data: T) => void;

/**
 * A small normalized-by-key query cache, in the spirit of Apollo's InMemoryCache.
 *
 * - `get` / `set` read and write results by query key.
 * - `subscribe` lets watchers react when a key is written (e.g. a network refresh).
 * - `fetch` de-duplicates concurrent network requests for the same key.
 * - Optionally persists to a Storage (sessionStorage) so a reload renders from cache first.
 */
export class QueryCache {
  private store = new Map<string, CacheEntry>();
  private listeners = new Map<string, Set<Listener>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private storage: Storage | null = null,
    private storageKey = 'spacex-query-cache-v2',
  ) {
    this.hydrate();
  }

  get<T>(key: string): CacheEntry<T> | undefined {
    return this.store.get(key) as CacheEntry<T> | undefined;
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, updatedAt: Date.now() });
    this.persist();
    this.listeners.get(key)?.forEach((listener) => listener(data));
  }

  subscribe<T>(key: string, listener: Listener<T>): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener as Listener);
    return () => {
      set!.delete(listener as Listener);
      if (set!.size === 0) this.listeners.delete(key);
    };
  }

  /** Run `fetcher` for `key`, sharing one in-flight request between callers, and write the result. */
  fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const promise = fetcher()
      .then((data) => {
        this.set(key, data);
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.store.clear();
    // Forget in-flight requests too, so later fetches start fresh instead of
    // joining a request made before the clear.
    this.inflight.clear();
    this.persist();
  }

  private hydrate(): void {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) return;
      const entries = JSON.parse(raw) as [string, CacheEntry][];
      this.store = new Map(entries);
    } catch {
      // Corrupt or inaccessible storage: start with an empty cache.
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify([...this.store]));
    } catch {
      // Storage full or unavailable: the in-memory cache still works.
    }
  }
}

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** App-wide cache instance. */
export const queryCache = new QueryCache(sessionStorageOrNull());
