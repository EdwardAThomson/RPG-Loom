import { useGameEngine } from './hooks/useGameEngine';
import { useState, useRef, useEffect } from 'react';
import './index.css';

// Components
import { Navigation, TabId } from './components/Navigation';
import { ActivityView } from './components/ActivityView';
import { TravelView } from './components/TravelView';
import { InventoryView } from './components/InventoryView';
import { CharacterView } from './components/CharacterView';
import { CraftingView } from './components/CraftingView';
import { QuestView } from './components/QuestView';
import { EventView } from './components/EventView';
import { DebugView } from './components/DebugView';
import { SettingsModal } from './components/SettingsModal';
import { AIDebugModal } from './components/AIDebugModal';
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
  const { state, events, dispatch, content, exportSave, importSave, hardReset, tickRate, setTickRate } = useGameEngine();
  const [activeTab, setActiveTab] = useState<TabId>('activity');
  const [showSettings, setShowSettings] = useState(false);
  const [showAIDebug, setShowAIDebug] = useState(false);

  // XP Rate (Last 60s)
  const [xpRate, setXpRate] = useState(0);
  const xpHistory = useRef<{ t: number, xp: number }[]>([]);
  const currentXp = state?.player?.xp;
  const lastXpRef = useRef(currentXp);

  // Keep ref updated for interval closure
  useEffect(() => {
    lastXpRef.current = currentXp;
  }, [currentXp]);

  useEffect(() => {
    const timer = setInterval(() => {
      const xp = lastXpRef.current;
      if (typeof xp === 'undefined') return;

      const now = Date.now();
      // Always push current state to maintain time window
      xpHistory.current.push({ t: now, xp });

      // Remove old entries (> 60s)
      const windowStart = now - 60000;
      while (xpHistory.current.length > 0 && xpHistory.current[0].t < windowStart) {
        xpHistory.current.shift();
      }

      if (xpHistory.current.length > 1) {
        const start = xpHistory.current[0];
        const end = xpHistory.current[xpHistory.current.length - 1];
        const diffXp = end.xp - start.xp;

        // Prevent div by zero or tiny windows causing massive spikes
        const diffTimeMs = end.t - start.t;

        if (diffTimeMs > 2000) { // Require at least 2s of history for stability
          const diffTimeHours = diffTimeMs / 3600000;
          setXpRate(Math.round(diffXp / diffTimeHours));
        } else if (diffXp === 0) {
          setXpRate(0);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Listen for AI Debug open event
  useEffect(() => {
    const handleOpenAIDebug = () => setShowAIDebug(true);
    window.addEventListener('openAIDebug', handleOpenAIDebug);
    return () => window.removeEventListener('openAIDebug', handleOpenAIDebug);
  }, []);

  if (!state) return <div className="container">Loading Realm...</div>;

  const { player } = state;

  return (
    <div className="container">
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 className="title">RPG Loom</h1>
        </div>

        <div className="stats" style={{ flex: 1, justifyContent: 'center' }}>
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: '#fff' }}>{player.level}</span>
            <span>TOTAL LEVEL</span>
          </div>
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: 'var(--color-combat)' }}>{player.combatLevel}</span>
            <span>COMBAT LEVEL</span>
          </div>
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: '#fff' }}>{Math.floor(player.xp).toLocaleString()}</span>
            <span>TOTAL XP ({xpRate}/hr)</span>
          </div>
          <div className="stat">
            <span style={{ fontSize: '1.2rem', color: 'var(--color-gold)' }}>{player.gold.toLocaleString()}</span>
            <span>GOLD</span>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: 'transparent',
            border: '1px solid #444',
            color: '#888',
            cursor: 'pointer',
            padding: '0.5rem',
            borderRadius: '4px',
            fontSize: '1.2rem'
          }}
          title="System Settings"
        >
          ⚙️
        </button>
      </header>

      {showSettings && <SettingsModal
        exportSave={exportSave}
        importSave={importSave}
        hardReset={hardReset}
        onClose={() => setShowSettings(false)}
      />
      }

      {showAIDebug && <AIDebugModal onClose={() => setShowAIDebug(false)} />}

      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="tab-layout">
        <div className="tab-content" style={{ minHeight: 0, overflowY: 'auto' }}>
          {activeTab === 'activity' && <ActivityView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'travel' && <TravelView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'inventory' && <InventoryView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'crafting' && <CraftingView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'character' && <CharacterView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'quests' && <QuestView state={state} content={content} dispatch={dispatch} />}
          {activeTab === 'debug' && <DebugView
            state={state}
            content={content}
            dispatch={dispatch}
            tickRate={tickRate}
            setTickRate={setTickRate}
            onResetSkills={() => {
              if (window.confirm("This will recalculate your levels based on the new difficulty curve. Your Total XP will be preserved. Are you sure?")) {
                dispatch({ type: 'RESET_SKILLS', atMs: Date.now() });
              }
            }}
          />}
          {activeTab === 'settings' && <div className="card"><h2>Settings</h2><p>Coming soon...</p></div>}
        </div>

        <EventView events={events} content={content} />
      </main>
    </div>
  );
}

export default App;
