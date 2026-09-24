import { useRef } from 'react';
import { useLaunches } from '../hooks/useLaunches';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { LaunchTable } from './LaunchTable';
import { LoadMore } from './LoadMore';

/** Pages 1–10 are loaded with the "Load more" button; page 11 onwards by infinite scroll. */
export const BUTTON_PAGE_LIMIT = 10;

export function LaunchList({ rocketId }: { rocketId: string | null }) {
  const { launches, pageCount, loadedPages, hasNextPage, loadingMore, refreshing, error, source, loadMore, retry } =
    useLaunches(rocketId);
  const scroller = useRef<HTMLDivElement>(null);

  const infinite = pageCount >= BUTTON_PAGE_LIMIT;
  const scrollable = useInfiniteScroll(scroller, infinite && hasNextPage && !loadingMore && !error, loadMore);

  const firstLoad = launches.length === 0 && loadingMore;

  return (
    <section className="launch-list" aria-busy={loadingMore}>
      <div className="status" role="status">
        {source && (
          <span
            className={`badge ${source === 'snapshot' ? 'warn' : 'live'}`}
            title={
              source === 'snapshot'
                ? 'api.spacexdata.com is unreachable, so archived API data is shown. Reload to retry the live API.'
                : 'Data from api.spacexdata.com'
            }
          >
            {source === 'snapshot' ? 'Offline snapshot' : 'Live API'}
          </span>
        )}
        {refreshing && <span className="badge">Showing cached results · refreshing…</span>}
        <span className="muted">
          {launches.length} launches · page {loadedPages}
          {infinite ? ' · infinite scroll' : ''}
        </span>
      </div>

      {/* Only this region scrolls; the table header sticks to its top. */}
      <div
        ref={scroller}
        className="table-scroll"
        tabIndex={0}
        aria-label="Launches"
        // Toggle the sticky column's edge shadow without re-rendering on every scroll.
        onScroll={(e) => e.currentTarget.classList.toggle('is-scrolled-x', e.currentTarget.scrollLeft > 0)}
      >
        {firstLoad ? (
          <p className="placeholder">Loading launches…</p>
        ) : launches.length === 0 ? (
          !error && <p className="placeholder">No launches found for this rocket.</p>
        ) : (
          <LaunchTable launches={launches} />
        )}

        <div className="footer">
          {error ? (
            <p className="error">
              Couldn’t load launches: {error.message}{' '}
              <button type="button" onClick={retry}>
                Retry
              </button>
            </p>
          ) : !hasNextPage && !loadingMore ? (
            launches.length > 0 && <p className="muted">That’s every launch.</p>
          ) : infinite && scrollable ? (
            <>
              <p className="muted">{loadingMore ? 'Loading more…' : 'Scroll for more'}</p>
              {/* For keyboard and screen-reader users; only visible when focused. */}
              <button type="button" className="visually-hidden-focusable" onClick={loadMore} disabled={loadingMore}>
                Load next page
              </button>
            </>
          ) : (
            !firstLoad && <LoadMore onClick={loadMore} loading={loadingMore} />
          )}
        </div>
      </div>
    </section>
  );
}
