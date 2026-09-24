import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Launch } from '../api/types';
import { PAGE_SIZE } from '../api/spacex';
import { formatLaunchDate } from '../utils/formatDate';
import { TruncatedText } from './TruncatedText';

/** Stagger between rows of the same page as they grow in. */
const ROW_STAGGER_MS = 70;

/**
 * Table rows can't animate their height, so each cell's content sits in a
 * wrapper that grows from 0fr to 1fr (see `.cell` in App.css). The table then
 * expands smoothly as rows are added instead of jumping.
 */
function Cell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <td className={className}>
      <div className="cell">
        <div className="cell-clip">
          <div className="cell-content">{children}</div>
        </div>
      </div>
    </td>
  );
}

/** Mission patch, falling back to text when there's no URL or the image fails to load. */
function PatchImage({ src, mission }: { src: string | null; mission: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="muted">No patch</span>;
  return (
    <img src={src} alt={`${mission} patch`} width={56} height={56} loading="lazy" onError={() => setFailed(true)} />
  );
}

export function LaunchTable({ launches }: { launches: Launch[] }) {
  return (
    <table className="launches">
        {/* Fixed, equal column widths so long text truncates instead of widening its column. */}
        <colgroup>
          <col span={5} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Mission Name</th>
            <th scope="col">Rocket Name</th>
            <th scope="col">Launch Date</th>
            <th scope="col">Details</th>
            <th scope="col">Patch</th>
          </tr>
        </thead>
        <tbody>
          {launches.map((l, i) => (
            // Rows are keyed by id, so only newly added rows mount and animate.
            <tr
              key={l.id}
              className="row-enter"
              style={{ '--row-delay': `${(i % PAGE_SIZE) * ROW_STAGGER_MS}ms` } as CSSProperties}
            >
              <Cell className="mission">
                <TruncatedText text={l.name} lines={1} />
              </Cell>
              <Cell>{l.rocket.name}</Cell>
              <Cell className="date">
                <time dateTime={l.date_utc}>{formatLaunchDate(l.date_utc)}</time>
              </Cell>
              <Cell className="details">
                {l.details ? <TruncatedText text={l.details} /> : <span className="muted">No details</span>}
              </Cell>
              <Cell className="patch">
                <PatchImage src={l.links.patch.small} mission={l.name} />
              </Cell>
            </tr>
          ))}
        </tbody>
    </table>
  );
}
