import type { Rocket } from '../api/types';

interface Props {
  rockets: Rocket[];
  value: string | null;
  onChange: (rocketId: string | null) => void;
  disabled?: boolean;
}

export function RocketFilter({ rockets, value, onChange, disabled }: Props) {
  return (
    <div className="filter">
      <label htmlFor="rocket-filter">Rocket</label>
      <div className="select-wrap">
        <select
          id="rocket-filter"
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">All rockets</option>
          {rockets.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <svg className="chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
