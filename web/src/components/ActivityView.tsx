import { EngineState, PlayerCommand } from '@rpg-loom/shared';
import { TacticsSelector } from './TacticsSelector';
import { useState, useEffect } from 'react';

// We need a way to know location names, assuming content is passed or we map it.
// Since we are creating a generic engine, ideally we use the content index.
// But for now, let's assume 'content' is passed inProps if we updated App.tsx, or we use a hardcoded list if not.
// The user prompt implied we should just "do it", so I'll try to use the content object if available.
// I'll update the interface to accept content.

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any; // MVP: generic type for now to avoid deep type imports in web if not set up
}

export function ActivityView({ state, dispatch, content }: Props) {
    const { activity, player } = state;

    // Default to current location or forest
    const [selectedLocationId, setSelectedLocationId] = useState<string>(state.currentLocationId || 'loc_forest');

    // Sync selection if player moves (e.g. from save load) - optional but nice
    // But we might want to let them browse while staying put.
    // Let's just default on mount.

    const locations = content?.locationsById ? Object.values(content.locationsById) : [];

    // Filter locations by level requirement? Helper to check reqs.
    const availableLocations = (locations as any[]).filter(loc => {
        // Show if level >= req
        if (!loc.requirements) return true;
        return player.level >= (loc.requirements.minLevel || 0);
    });

    return (
        <section className="card">
            <h2>Current Activity</h2>
            <div className="activity-status">
                <div className="current-action">{activity.params.type.toUpperCase()}</div>
                {'locationId' in activity.params && <div className="location">{(activity.params as any).locationId}</div>}

                <div className="combat-widget" style={{
                    visibility: state.activeEncounter ? 'visible' : 'hidden',
                    opacity: state.activeEncounter ? 1 : 0,
                    marginBottom: state.activeEncounter ? 0 : '1rem'
                }}>
                    {state.activeEncounter ? (
                        <>
                            <h3 style={{ color: '#ff4444', marginBottom: '0.5rem' }}>⚔️ Combat ⚔️</h3>
                            <div style={{ fontSize: '1.1rem' }}>{state.activeEncounter.enemyId}</div>
                            <div style={{ color: '#888', fontSize: '0.9rem' }}>Lvl {state.activeEncounter.enemyLevel}</div>
                            <div style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>
                                HP: {state.activeEncounter.enemyHp} / {state.activeEncounter.enemyMaxHp}
                            </div>
                        </>
                    ) : (
                        // Placeholder content to reserve height exactly matches the active state structure
                        <>
                            <h3 style={{ marginBottom: '0.5rem' }}>&nbsp;</h3>
                            <div style={{ fontSize: '1.1rem' }}>&nbsp;</div>
                            <div style={{ fontSize: '0.9rem' }}>&nbsp;</div>
                            <div style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>
                                &nbsp;
                            </div>
                        </>
                    )}
                </div>
            </div>

            <section style={{
                marginBottom: '1.5rem',
                visibility: state.activeEncounter ? 'visible' : 'hidden',
                opacity: state.activeEncounter ? 1 : 0,
                transition: 'opacity 0.2s'
            }}>
                <h3 style={{ fontSize: '1rem', color: '#888', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Combat Stance</h3>
                <TacticsSelector player={player} dispatch={dispatch} />
            </section>

            <div className="actions">
                <div style={{ color: '#666', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Travel & Action</div>

                {/* Location Selector */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ marginRight: '0.5rem', color: '#ccc' }}>Region:</label>
                    <select
                        value={selectedLocationId}
                        onChange={(e) => setSelectedLocationId(e.target.value)}
                        style={{ padding: '0.5rem', width: '100%', maxWidth: '300px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                    >
                        {availableLocations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} {loc.requirements?.minLevel > 1 ? `(Lvl ${loc.requirements.minLevel})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {/* Gather */}
                    <button
                        style={activity.params.type === 'gather' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)', flex: 1 } : { flex: 1 }}
                        onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'gather', locationId: selectedLocationId }, atMs: Date.now() })}
                    >
                        Gather Here
                    </button>

                    {/* Hunt */}
                    <button
                        style={activity.params.type === 'hunt' ? { borderColor: 'var(--color-crimson)', background: 'rgba(166, 28, 28, 0.1)', flex: 1 } : { flex: 1 }}
                        onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'hunt', locationId: selectedLocationId }, atMs: Date.now() })}
                    >
                        Hunt Here
                    </button>
                </div>

                <div className="divider" style={{ width: '100%', height: '1px', background: '#333', margin: '1rem 0' }}></div>

                {/* Train */}
                <button
                    disabled={player.gold < 1}
                    style={{
                        ...(player.gold < 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                        ...(activity.params.type === 'train' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {})
                    }}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'swordsmanship' }, atMs: Date.now() })}
                >
                    Train Sword (1 Gold)
                </button>

                {/* Stop */}
                <button
                    className="primary"
                    style={activity.params.type === 'idle' ? { opacity: 0.5 } : {}}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}
                >
                    Return to Town (Idle)
                </button>
            </div>
        </section>
    );
}
