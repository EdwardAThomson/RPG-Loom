import { EngineState, PlayerCommand } from '@rpg-loom/shared';
import { TacticsSelector } from './TacticsSelector';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
}

export function ActivityView({ state, dispatch }: Props) {
    const { activity, player } = state;

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
                <div style={{ color: '#666', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Actions</div>

                {/* Gather */}
                <button
                    style={activity.params.type === 'gather' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {}}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'gather', locationId: 'loc_forest' }, atMs: Date.now() })}
                >
                    Gather (Forest)
                </button>

                {/* Hunt */}
                <button
                    style={activity.params.type === 'hunt' ? { borderColor: 'var(--color-crimson)', background: 'rgba(166, 28, 28, 0.1)' } : {}}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'hunt', locationId: 'loc_forest' }, atMs: Date.now() })}
                >
                    Hunt (Forest)
                </button>

                {/* Train */}
                <button
                    disabled={player.gold < 1}
                    style={{
                        ...(player.gold < 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                        ...(activity.params.type === 'train' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {})
                    }}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'swordsmanship' }, atMs: Date.now() })}
                >
                    Train Sword
                </button>

                {/* Stop */}
                <button
                    className="primary"
                    style={activity.params.type === 'idle' ? { opacity: 0.5 } : {}}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}
                >
                    Stop Activity
                </button>
            </div>
        </section>
    );
}
