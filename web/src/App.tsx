import { useGameEngine } from './hooks/useGameEngine';
import { useState, useRef, useEffect, useMemo } from 'react';
import './index.css';
import { probeGateway } from './services/gateway';
import { initAuth } from './services/auth';
import { getNextGoals } from '@rpg-loom/engine';
import { Heart, Settings } from 'lucide-react';

// Components
import { Navigation, TabId } from './components/Navigation';
import { ActivityView } from './components/ActivityView';
import { TravelView } from './components/TravelView';
import { InventoryView } from './components/InventoryView';
import { CharacterView } from './components/CharacterView';
import { CraftingView } from './components/CraftingView';
import { QuestView } from './components/QuestView';
import { EventView } from './components/EventView';
// import { DebugView } from './components/DebugView';
import { SettingsModal } from './components/SettingsModal';
import { AIDebugModal } from './components/AIDebugModal';
import { OfflineSummaryModal } from './components/OfflineSummaryModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { NextGoalsPanel } from './components/NextGoalsPanel';
import { JournalView } from './components/JournalView';
import { NpcsView } from './components/NpcsView';
import { useJournalAutoWrite } from './hooks/useJournalAutoWrite';
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
  const {
    state, events, dispatch, content, exportSave, importSave, hardReset,
    tickRate, setTickRate, pendingOfflineSummary, dismissOfflineSummary,
    cloudStatus, pendingConflict, syncNow,
    resolveConflictKeepLocal, resolveConflictUseServer
  } = useGameEngine();
  const [activeTab, setActiveTab] = useState<TabId>('activity');
  const [showSettings, setShowSettings] = useState(false);
  const [showAIDebug, setShowAIDebug] = useState(false);

  // Re-hydrate auth state from localStorage (fire-and-forget, sync).
  useEffect(() => { initAuth(); }, []);

  // Auto-write journal entries on quest completions (no-op when
  // signed-out or gateway unreachable).
  useJournalAutoWrite(events, content);

  // Compute "next goals" once per state change. Cheap (O(quests +
  // recipes + locations)) but memoizing dodges the recomputation on
  // unrelated re-renders (e.g. xpRate updates).
  const nextGoals = useMemo(
    () => (state ? getNextGoals(state, content, 3) : []),
    [state, content]
  );

  // Probe gateway on startup (fire-and-forget, non-blocking)
  useEffect(() => { probeGateway(); }, []);

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

  if (!state) return <div className="hud-loading">Loading the realm…</div>;

  const { player } = state;
  const location = content?.locationsById?.[state.currentLocationId];
  const hp = player.baseStats.hp;
  const hpMax = player.baseStats.hpMax;
  const isScene = activeTab === 'activity';

  return (
    <>
      <Scene image={location?.image} dim={!isScene} />

      <div className="hud">
        <header className="hud-top">
          <div className="hud-location">
            <span className="hud-eyebrow">{location?.type === 'town' ? 'Town' : 'Wilds'} · RPG Loom</span>
            <h1>{location?.name ?? state.currentLocationId}</h1>
          </div>

          <div className="hud-vitals">
            <div className="vital vital-hp" title={`Health ${hp} / ${hpMax}`}>
              <span className="vital-label"><Heart size={13} aria-hidden /> {hp} / {hpMax}</span>
              <span className={`bar bar-hp${hp < hpMax * 0.3 ? ' is-low' : ''}`}><i style={{ width: `${hpMax ? (hp / hpMax) * 100 : 0}%` }} /></span>
            </div>
            <dl className="hud-stats">
              <div><dt>Total Lv</dt><dd>{player.level}</dd></div>
              <div><dt>Combat</dt><dd>{player.combatLevel}</dd></div>
              <div><dt>XP/hr</dt><dd>{xpRate.toLocaleString()}</dd></div>
              <div className="stat-gold"><dt>Gold</dt><dd>{player.gold.toLocaleString()}</dd></div>
            </dl>
            <button type="button" className="icon-button" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
              <Settings size={18} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

        <main className={`hud-main${isScene ? ' is-scene' : ''}`}>
          {activeTab === 'activity' && <ActivityView state={state} dispatch={dispatch} content={content} events={events} />}
          {activeTab === 'travel' && <TravelView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'inventory' && <InventoryView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'crafting' && <CraftingView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'character' && <CharacterView state={state} dispatch={dispatch} content={content} />}
          {activeTab === 'quests' && <QuestView state={state} content={content} dispatch={dispatch} />}
          {activeTab === 'journal' && <JournalView />}
          {activeTab === 'npcs' && <NpcsView state={state} content={content} dispatch={dispatch} events={events} />}
          {/* {activeTab === 'debug' && <DebugView
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
          />} */}
        </main>

        <aside className="hud-side">
          <NextGoalsPanel goals={nextGoals} onJumpTo={setActiveTab} />
          <EventView events={events} content={content} />
        </aside>

        <footer className="hud-footer">
          &copy; 2026 Edward Thomson (<a href="https://octonion.io/" target="_blank" rel="noopener noreferrer">Octonion Software</a>)
        </footer>
      </div>

      {showSettings && <SettingsModal
        exportSave={exportSave}
        importSave={importSave}
        hardReset={hardReset}
        onClose={() => setShowSettings(false)}
        cloudStatus={cloudStatus}
        onSyncNow={syncNow}
      />
      }

      {showAIDebug && <AIDebugModal onClose={() => setShowAIDebug(false)} />}

      {pendingOfflineSummary && (
        <OfflineSummaryModal
          summary={pendingOfflineSummary}
          content={content}
          onClose={dismissOfflineSummary}
        />
      )}

      {pendingConflict && (
        <ConflictResolutionModal
          conflict={pendingConflict}
          onKeepLocal={resolveConflictKeepLocal}
          onUseServer={resolveConflictUseServer}
        />
      )}
    </>
  );
}

/**
 * Full-bleed location art behind the HUD. Keyed on the image so a
 * travel cross-fades in the new place rather than snapping.
 */
function Scene({ image, dim }: { image?: string; dim: boolean }) {
  return (
    <div className={`scene${dim ? ' is-dim' : ''}`} aria-hidden>
      {image && <div key={image} className="scene-art" style={{ backgroundImage: `url("${image}")` }} />}
    </div>
  );
}

export default App;
