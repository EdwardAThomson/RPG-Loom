import { useGameEngine } from './hooks/useGameEngine';
import './index.css';

function App() {
  const { state, events, dispatch } = useGameEngine();

  if (!state) return <div className="container">Loading Realm...</div>;

  const { player, activity, metrics } = state;
  const xpRate = metrics?.startTimeMs
    ? Math.round((player.xp - metrics.startXp) / ((Date.now() - metrics.startTimeMs) / 3600000))
    : 0;

  return (
    <div className="container">
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <h1>RPG Loom</h1>
        <div style={{ display: 'flex', gap: '2rem', color: 'var(--text-muted)' }}>
          <div>Level {player.level}</div>
          <div>XP: {player.xp} <span style={{ fontSize: '0.8em', color: 'var(--accent-tertiary)' }}>({xpRate}/hr)</span></div>
          <div>Gold: {player.gold} <span style={{ color: 'var(--accent-primary)' }}>●</span></div>
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1fr', gap: '2rem' }}>

        {/* Left Column: Activity & Actions */}
        <section className="panel">
          <h2>Current Activity</h2>
          <div style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-primary)' }}>
            {activity.params.type.toUpperCase()}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            Start Time: {new Date(activity.startedAtMs).toLocaleTimeString()}
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}>
              Stop (Idle)
            </button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'swordsmanship' }, atMs: Date.now() })}>
              Train Sword
            </button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'hunt', locationId: 'loc_forest' }, atMs: Date.now() })}>
              Hunt Forest
            </button>
          </div>
        </section>

        {/* Right Column: Event Log */}
        <section className="panel">
          <h2>Event Log</h2>
          <div style={{ height: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {events.slice().reverse().map(ev => (
              <div key={ev.id} style={{ borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>
                  [{new Date(ev.atMs).toLocaleTimeString()}]
                </span>
                <span style={{ color: ev.type === 'ERROR' || ev.payload.outcome === 'loss' ? 'var(--accent-secondary)' : 'var(--text-main)' }}>
                  {ev.type}
                </span>
                <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                  {JSON.stringify(ev.payload, (k, v) => k === 'items' ? '[Items...]' : v)}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

export default App;
