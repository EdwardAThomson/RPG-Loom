import React, { useEffect, useMemo, useRef, useState } from 'react';

import { createNewState, step, applyCommand } from '@rpg-loom/engine';
import type { EngineState, GameEvent, NarrativeBlock } from '@rpg-loom/shared';
import { createContentIndex } from '@rpg-loom/content';
import { GuildboundClient } from '@rpg-loom/sdk';

const GW = new GuildboundClient('http://localhost:8787');

function nowMs() {
  return Date.now();
}

export default function App() {
  const content = useMemo(() => createContentIndex(), []);
  const [state, setState] = useState<EngineState>(() =>
    createNewState({
      saveId: 'save_demo_01',
      playerId: 'p1',
      playerName: 'Adventurer',
      nowMs: nowMs(),
      startLocationId: 'loc_bramblewick_outpost'
    })
  );
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [narrative, setNarrative] = useState<NarrativeBlock[]>([]);
  const [streamText, setStreamText] = useState('');
  const timerRef = useRef<number | null>(null);

  // ticking loop (1s)
  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setState((prev) => {
        const res = step(prev, nowMs(), content, { tickMs: 1000 });
        if (res.events.length) {
          setEvents((old) => [...old, ...res.events].slice(-200));
          // auto-trigger narrative on quest completion
          const completed = res.events.find((e) => e.type === 'QUEST_COMPLETED');
          if (completed) {
            void runNarrative('journal_entry', {
              recentEvents: res.events.slice(-30),
              player: { level: res.state.player.level, name: res.state.player.name },
              locationId: res.state.currentLocationId
            });
          }
        }
        return res.state;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [content]);

  async function runNarrative(type: any, facts: Record<string, unknown>) {
    setStreamText('');
    try {
      const { taskId } = await GW.createNarrativeTask({
        type,
        facts,
        references: {},
        // pick backend on the gateway using DEFAULT_NARRATIVE_BACKEND
        backendId: null
      });

      GW.streamTask(taskId, (evt) => {
        if (evt.type === 'token') setStreamText((t) => t + evt.data);
        if (evt.type === 'line') setStreamText((t) => (t ? t + '\n' : '') + evt.data);
        if (evt.type === 'done') {
          const block = (evt.data as any)?.block;
          if (block) setNarrative((n) => [...n, block].slice(-50));
        }
        if (evt.type === 'error') setStreamText((t) => t + `\n[ai unavailable] ${evt.data.message}`);
      });
    } catch (e: any) {
      // AI is optional; game should keep running.
      setStreamText(`[ai unavailable] ${e?.message ?? String(e)}`);
    }
  }

  function dispatch(cmd: any) {
    const res = applyCommand(state, cmd, content);
    setState(res.state);
    if (res.events.length) setEvents((old) => [...old, ...res.events].slice(-200));
  }

  const activeQuests = state.quests.filter((q) => q.status === 'active');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h1>Guildbound Chronicles (MVP)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section style={{ border: '1px solid #444', borderRadius: 12, padding: 12 }}>
          <h2>Player</h2>
          <div><b>Name:</b> {state.player.name}</div>
          <div><b>Level:</b> {state.player.level} (<b>XP</b> {state.player.xp})</div>
          <div><b>Gold:</b> {state.player.gold}</div>
          <div><b>Location:</b> {state.currentLocationId}</div>
          <div><b>Activity:</b> {state.activity.params.type}</div>

          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', atMs: nowMs(), params: { type: 'idle' } })}>Idle</button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', atMs: nowMs(), params: { type: 'gather', locationId: 'loc_glimmerwood_edge' } })}>Gather (Glimmerwood)</button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', atMs: nowMs(), params: { type: 'hunt', locationId: 'loc_glimmerwood_edge' } })}>Hunt (Glimmerwood)</button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', atMs: nowMs(), params: { type: 'train', skillId: 'swordsmanship' } })}>Train Sword</button>
            <button onClick={() => dispatch({ type: 'SET_ACTIVITY', atMs: nowMs(), params: { type: 'craft', recipeId: 'rcp_minor_heal_potion' } })}>Craft Potion</button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => dispatch({ type: 'ACCEPT_QUEST', atMs: nowMs(), templateId: 'qt_kill_wolves' })}>Accept: Kill Wolves</button>
            <button onClick={() => dispatch({ type: 'ACCEPT_QUEST', atMs: nowMs(), templateId: 'qt_gather_herbs' })}>Accept: Gather Herbs</button>
            <button
              onClick={() =>
                runNarrative('rumor_feed', {
                  player: { level: state.player.level, locationId: state.currentLocationId },
                  flags: state.player.flags
                })
              }
            >
              Generate Rumors
            </button>
          </div>

          <h3 style={{ marginTop: 12 }}>Active Quests</h3>
          {activeQuests.length === 0 ? (
            <div style={{ opacity: 0.7 }}>None</div>
          ) : (
            <ul>
              {activeQuests.map((q) => (
                <li key={q.id}>
                  {q.templateId} — {q.progress.current}/{q.progress.required} (loc {q.locationId})
                </li>
              ))}
            </ul>
          )}

          <h3>Inventory</h3>
          <ul>
            {state.inventory.length ? (
              state.inventory.map((s) => (
                <li key={s.itemId}>
                  {s.itemId} × {s.qty}
                </li>
              ))
            ) : (
              <li style={{ opacity: 0.7 }}>Empty</li>
            )}
          </ul>
        </section>

        <section style={{ border: '1px solid #444', borderRadius: 12, padding: 12 }}>
          <h2>Event Log</h2>
          <div style={{ height: 360, overflow: 'auto', background: '#111', padding: 8, borderRadius: 8 }}>
            {events
              .slice()
              .reverse()
              .map((e) => (
                <div key={e.id} style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
                  [{new Date(e.atMs).toLocaleTimeString()}] {e.type} {JSON.stringify((e as any).payload)}
                </div>
              ))}
          </div>

          <h2 style={{ marginTop: 12 }}>Narrative</h2>
          <div style={{ border: '1px solid #222', borderRadius: 8, padding: 8, background: '#0b0b0b' }}>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.9 }}>
              {streamText || '(stream output)'}
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            {narrative
              .slice()
              .reverse()
              .map((b) => (
                <div key={b.id} style={{ marginTop: 10, padding: 10, border: '1px solid #222', borderRadius: 8 }}>
                  <div style={{ fontWeight: 700 }}>{b.title ?? b.type}</div>
                  {b.lines?.map((ln, i) => (
                    <div key={i} style={{ opacity: 0.9 }}>{ln}</div>
                  ))}
                </div>
              ))}
          </div>
        </section>
      </div>

      <p style={{ marginTop: 16, opacity: 0.7 }}>
        Tip: run the gateway with <code>npm run dev:gateway</code> (port 8787), then <code>npm run dev:web</code>.
      </p>
    </div>
  );
}
