import { useGameEngine } from './hooks/useGameEngine';
import { useState, useRef, useEffect } from 'react';
import './index.css';

// Components
import { Navigation, TabId } from './components/Navigation';
import { ActivityView } from './components/ActivityView';
import { InventoryView } from './components/InventoryView';
import { CharacterView } from './components/CharacterView';
import { QuestView } from './components/QuestView';
import { EventView } from './components/EventView';

import React from 'react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#ff4444', background: '#222' }}>
          <h2>Application Crashed</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const { state, events, dispatch, content } = useGameEngine();
  const [activeTab, setActiveTab] = useState<TabId>('activity');

  // XP Rate (Last 60s)
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

  const { player } = state;

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">RPG Loom</h1>
        <div className="stats">
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: '#fff' }}>{player.level}</span>
            <span>LEVEL</span>
          </div>
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: '#fff' }}>{Math.floor(player.xp).toLocaleString()}</span>
            <span>XP ({xpRate}/hr)</span>
          </div>
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: 'var(--color-gold)' }}>{player.gold.toLocaleString()}</span>
            <span>GOLD</span>
          </div>
        </div>
      </header>

      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="tab-layout">
        <div className="tab-content" style={{ minHeight: 0, overflowY: 'auto' }}>
          {activeTab === 'activity' && <ActivityView state={state} dispatch={dispatch} />}
          {activeTab === 'inventory' && <InventoryView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'character' && <CharacterView state={state} dispatch={dispatch} />}
          {activeTab === 'quests' && <QuestView state={state} />}
          {activeTab === 'settings' && <div className="card"><h2>Settings</h2><p>Coming soon...</p></div>}
        </div>

        <EventView events={events} />
      </main>
    </div>
  );
}

export default App;
