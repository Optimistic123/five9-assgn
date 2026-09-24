# SpaceX Launches

A React + TypeScript app that lists SpaceX launches from the [SpaceX API](https://github.com/r-spacex/SpaceX-API). It has a rocket filter, a "Load more" button, infinite scrolling, and a query cache that works like Apollo's `cache-and-network` fetch policy.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest + React Testing Library
npm run build    # type-check + production build
```

## Requirements → implementation

| Requirement | Where |
|---|---|
| Table with mission name, rocket name, launch date, details, patch | `src/components/LaunchTable.tsx` |
| Rocket dropdown filter above the table | `src/components/RocketFilter.tsx`, `src/App.tsx` |
| "Load more" below the table, 3 records per page for 10 pages | `src/components/LaunchList.tsx`, `src/hooks/useLaunches.ts` |
| Infinite scroll from page 11 on | `src/hooks/useInfiniteScroll.ts` (IntersectionObserver sentinel) |
| Cache for launch queries, like Apollo `cache-and-network` | `src/cache/queryCache.ts`, `src/cache/cacheAndNetwork.ts` |

### API
The spec's `image/thumbnail_url` field comes from the old SpaceX GraphQL API (`api.spacex.land`), which has been shut down. This app uses the REST v4 API instead:

- `GET /v4/rockets` fills the dropdown.
- `POST /v4/launches/query` returns one page, using `limit: 3`, `page: n`, `sort: date_utc desc`, an optional `{ rocket: id }` filter, and `populate` for the rocket name.
- The patch image comes from `links.patch.small`, which is the v4 field that replaces `thumbnail_url`.

**Live API with an offline fallback** (`src/api/spacex.ts`):
- **API is up:** data comes from `api.spacexdata.com`, and the table shows a green **Live API** badge.
- **API is down:** `api.spacexdata.com` has been returning Cloudflare **HTTP 525**. That error page has no CORS headers, so the browser logs a CORS error. The first failed request switches the session to `src/mock/mockApi.ts`. That module serves an archived snapshot of `/v4/launches` and `/v4/rockets` (205 launches), filtered, sorted and paginated the same way as the live query endpoint. The table then shows an **Offline snapshot** badge.
  - The app does not call the live API again for the rest of the session. That avoids repeated failing requests and keeps every page from the same dataset. Reloading the page tries the live API again.

### Cache (`cache-and-network`)
- `QueryCache` is an in-memory store keyed by query, for example `launches:<rocketId|all>:<page>` or `rockets`. It lets callers subscribe to a key, merges duplicate requests that are already in flight, and saves to `sessionStorage` so a page reload also starts from the cache.
- `watchQuery(cache, key, fetcher, onResult)`:
  1. On a cache hit, it returns the cached data right away, flagged as `fromCache` and still loading.
  2. It always sends the network request, whether or not the cache had data.
  3. When the response arrives, it writes it to the cache and returns the fresh data.
  4. If the request fails, it keeps the cached data and reports the error.
- Each page is a separate query. When you switch the filter back to a rocket you already viewed, its cached pages appear immediately and are refreshed in the background. A "Showing cached results · refreshing…" badge is displayed during the refresh.
