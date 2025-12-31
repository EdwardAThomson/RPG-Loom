import { useGameEngine } from './hooks/useGameEngine';
import { useState, useRef, useEffect } from 'react';
import { GameEvent } from '@rpg-loom/shared';
import './index.css';

type DisplayEvent = GameEvent | {
  id: string;
  atMs: number;
  type: 'SUMMARY';
  payload: { parts: string[] };
};

function App() {
  try {
    return AppContent();
  } catch (e: any) {
    return <div style={{ color: 'red', padding: 20 }}>CRITICAL ERROR: {e.message}<br /><pre>{e.stack}</pre></div>
  }
}

// Helper to format event summary parts
function formatEvent(ev: any) {
  if (ev.type === 'XP_GAINED') return `+${ev.payload.amount} XP`;
  if (ev.type === 'GOLD_CHANGED') return `+${ev.payload.amount} Gold`;
  if (ev.type === 'LOOT_GAINED') return `Loot: ${ev.payload.items.map((i: any) => i.itemId).join(', ')}`;
  if (ev.type === 'ENCOUNTER_RESOLVED') return `${ev.payload.outcome === 'win' ? 'Defeated' : 'Lost to'} ${ev.payload.enemyId}`;
  return ev.type;
}

function AppContent() {
  const { state, events, dispatch } = useGameEngine();
  // ... rest of logic


  // XP Rate (Last 60s)
  // In a real app we'd move this to the hook or engine, but for MVP UI:
  const [xpRate, setXpRate] = useState(0);
  const xpHistory = useRef<{ t: number, xp: number }[]>([]);

  const currentXp = state?.player?.xp;

  useEffect(() => {
    if (typeof currentXp === 'undefined') return;

    const now = Date.now();
    // Add current snapshot
    xpHistory.current.push({ t: now, xp: currentXp });

    // Remove old entries (> 60s)
    const windowStart = now - 60000;
    while (xpHistory.current.length > 0 && xpHistory.current[0].t < windowStart) {
      xpHistory.current.shift();
    }

    if (xpHistory.current.length > 1) {
      const start = xpHistory.current[0];
      const end = xpHistory.current[xpHistory.current.length - 1];
      const diffXp = end.xp - start.xp;
      const diffTime = (end.t - start.t) / 3600000; // hours
      if (diffTime > 0) {
        setXpRate(Math.round(diffXp / diffTime));
      }
    }
  }, [currentXp]);

  if (!state) return <div className="container">Loading Realm...</div>;

  const { player, activity } = state;

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">RPG Loom</h1>
        <div className="stats">
          <div className="stat">Level: {player.level}</div>
          <div className="stat">XP: {player.xp} <span style={{ fontSize: '0.8em', color: '#aaa' }}>({xpRate}/hr)</span></div>
          <div className="stat">Gold: {player.gold}</div>
        </div>
      </header>

      <main className="main-grid">
        <section className="card">
          <h2>Activity</h2>
          <div className="activity-status">
            Current: <strong>{activity.params.type.toUpperCase()}</strong>
            {'locationId' in activity.params && <div>Location: {(activity.params as any).locationId}</div>}
            {state.activeEncounter && (
              <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#420', border: '1px solid #f44' }}>
                <h3>⚔️ Combat ⚔️</h3>
                <div>Enemy: {state.activeEncounter.enemyId} (Lvl {state.activeEncounter.enemyLevel})</div>
                <div>HP: {state.activeEncounter.enemyHp} / {state.activeEncounter.enemyMaxHp}</div>
              </div>
            )}
          </div>

          <div className="actions">
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'gather', locationId: 'loc_forest' }, atMs: Date.now() })}>
              Gather (Forest)
            </button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'hunt', locationId: 'loc_forest' }, atMs: Date.now() })}>
              Hunt (Forest)
            </button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'swordsmanship' }, atMs: Date.now() })}>
              Train Sword
            </button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}>
              Stop
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Inventory</h2>
          <div className="inventory-grid">
            {state.inventory.map((item: any) => (
              <div key={item.itemId} className="inventory-item">
                {item.itemId} (x{item.qty})
              </div>
            ))}
            {state.inventory.length === 0 && <div className="empty">Empty</div>}
          </div>
        </section>

        <section className="card full-width">
          <h2>Event Log</h2>
          <div style={{ height: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {(() => {
              const aggregatedEvents: DisplayEvent[] = [];
              const sourceEvents = events.slice()
                .filter((ev: any) => ev.type !== 'TICK_PROCESSED')
                .reverse()
                .slice(0, 50);

              for (let i = 0; i < sourceEvents.length; i++) {
                const ev = sourceEvents[i];
                // Try to merge with previous if same tick and compatible types
                if (aggregatedEvents.length > 0) {
                  const last = aggregatedEvents[aggregatedEvents.length - 1];
                  if (last.atMs === ev.atMs &&
                    (ev.type === 'XP_GAINED' || ev.type === 'GOLD_CHANGED' || ev.type === 'LOOT_GAINED') &&
                    (last.type === 'XP_GAINED' || last.type === 'GOLD_CHANGED' || last.type === 'LOOT_GAINED' || last.type === 'ENCOUNTER_RESOLVED' || last.type === 'SUMMARY')) {

                    // Create or update summary
                    if (last.type !== 'SUMMARY') {
                      // Convert last to summary
                      const newSummary: DisplayEvent = {
                        id: last.id + '_sum',
                        atMs: last.atMs,
                        type: 'SUMMARY',
                        payload: { parts: [formatEvent(last)] }
                      };
                      aggregatedEvents[aggregatedEvents.length - 1] = newSummary;
                      newSummary.payload.parts.push(formatEvent(ev));
                    } else {
                      last.payload.parts.push(formatEvent(ev));
                    }
                    continue;
                  }
                }
                aggregatedEvents.push(ev);
              }

              return aggregatedEvents.map(ev => {
                if (ev.type === 'SUMMARY') {
                  return (
                    <div key={ev.id} className="event-entry summary">
                      <span className="time">{new Date(ev.atMs).toLocaleTimeString()}</span>
                      <span className="content">
                        {ev.payload.parts.join(', ')}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={ev.id} className="event-entry">
                    <span className="time">{new Date(ev.atMs).toLocaleTimeString()}</span>
                    <span className="content">
                      {formatEvent(ev)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        </section>

      </main>
    </div>
  );
}

export default App;
