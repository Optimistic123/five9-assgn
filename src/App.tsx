import { useState } from 'react';
import { fetchRockets } from './api/spacex';
import { useCacheAndNetwork } from './hooks/useCacheAndNetwork';
import { RocketFilter } from './components/RocketFilter';
import { LaunchList } from './components/LaunchList';

export default function App() {
  const [rocketId, setRocketId] = useState<string | null>(null);
  const rockets = useCacheAndNetwork('rockets', fetchRockets);

  return (
    <main className="app">
      <header>
        <h1>SpaceX Launches</h1>
        <p className="muted">Most recent first. Filter by rocket, then load more.</p>
      </header>

      <RocketFilter
        rockets={rockets.data ?? []}
        value={rocketId}
        onChange={setRocketId}
        disabled={!rockets.data}
      />
      {rockets.error && !rockets.data && (
        <p className="error">Couldn’t load rockets: {rockets.error.message}</p>
      )}

      {/* Remount per filter so paging state resets; cached pages for that filter render instantly. */}
      <LaunchList key={rocketId ?? 'all'} rocketId={rocketId} />
    </main>
  );
}
