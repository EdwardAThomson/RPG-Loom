import { EngineState, PlayerCommand } from '@rpg-loom/shared';
import { TacticsSelector } from './TacticsSelector';
import { useRef } from 'react';
import { MarketView } from './MarketView';

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

    const currentLocName = content?.locationsById?.[state.currentLocationId]?.name || state.currentLocationId;
    const isTown = content?.locationsById?.[state.currentLocationId]?.type === 'town';

    return (
        <section className="card">
            <h2>Current Activity</h2>
            <div className="activity-status">
                <div className="current-action">{activity.params.type.toUpperCase()}</div>
                {'locationId' in activity.params && (
                    <div className="location">
                        {content?.locationsById?.[(activity.params as any).locationId]?.name || (activity.params as any).locationId}
                    </div>
                )}

                <div style={{ marginTop: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold', color: player.baseStats.hp < player.baseStats.hpMax * 0.3 ? '#ff4444' : 'var(--color-gold)' }}>
                    Player HP: {player.baseStats.hp} / {player.baseStats.hpMax}
                </div>

                <div className="combat-widget" style={{
                    visibility: state.activeEncounter ? 'visible' : 'hidden',
                    opacity: state.activeEncounter ? 1 : 0,
                    marginBottom: state.activeEncounter ? 0 : '1rem'
                }}>
                    {state.activeEncounter ? (
                        <>
                            <h3 style={{ color: '#ff4444', marginBottom: '0.5rem' }}>⚔️ Combat ⚔️</h3>
                            <div style={{ fontSize: '1.1rem' }}>
                                {content?.enemiesById?.[state.activeEncounter.enemyId]?.name || state.activeEncounter.enemyId}
                            </div>
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
                <div style={{ color: '#666', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    Actions in {currentLocName}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {isTown ? (
                        <>
                            {/* Inn / Recovery */}
                            <button
                                style={activity.params.type === 'recovery' ? { borderColor: '#4caf50', background: 'rgba(76, 175, 80, 0.1)', flex: 1 } : { flex: 1 }}
                                onClick={() => dispatch({
                                    type: 'SET_ACTIVITY',
                                    params: { type: 'recovery', durationMs: 10000 }, // 10s rest block
                                    atMs: Date.now()
                                })}
                            >
                                Rest at Inn (Heal)
                            </button>

                            {/* Market - Toggle View? Actually simplest is to set activity to 'trade' and render MarketView INSTEAD of this buttons list?
                               Or ActivityView just switches mode?
                               Let's make "Trade" an activity state that RENDERS the market.
                            */}
                            <button
                                style={activity.params.type === 'trade' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)', flex: 1 } : { flex: 1 }}
                                onClick={() => dispatch({
                                    type: 'SET_ACTIVITY',
                                    params: { type: 'trade', locationId: state.currentLocationId },
                                    atMs: Date.now()
                                })}
                            >
                                Visit Market
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Wild Actions: Checked via Location Activities */}
                            {content?.locationsById?.[state.currentLocationId]?.activities?.includes('woodcut') && (
                                <button
                                    style={activity.params.type === 'woodcut' ? { borderColor: '#8b4513', background: 'rgba(139, 69, 19, 0.1)', flex: 1 } : { flex: 1 }}
                                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'woodcut', locationId: state.currentLocationId }, atMs: Date.now() })}
                                >
                                    🪓 Woodcut
                                </button>
                            )}

                            {content?.locationsById?.[state.currentLocationId]?.activities?.includes('mine') && (
                                <button
                                    style={activity.params.type === 'mine' ? { borderColor: '#777', background: 'rgba(119, 119, 119, 0.1)', flex: 1 } : { flex: 1 }}
                                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'mine', locationId: state.currentLocationId }, atMs: Date.now() })}
                                >
                                    ⛏️ Mine
                                </button>
                            )}

                            {content?.locationsById?.[state.currentLocationId]?.activities?.includes('forage') && (
                                <button
                                    style={activity.params.type === 'forage' ? { borderColor: '#4caf50', background: 'rgba(76, 175, 80, 0.1)', flex: 1 } : { flex: 1 }}
                                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'forage', locationId: state.currentLocationId }, atMs: Date.now() })}
                                >
                                    🌿 Forage
                                </button>
                            )}

                            {content?.locationsById?.[state.currentLocationId]?.activities?.includes('hunt') && (
                                <button
                                    style={activity.params.type === 'hunt' ? { borderColor: 'var(--color-crimson)', background: 'rgba(166, 28, 28, 0.1)', flex: 1 } : { flex: 1 }}
                                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'hunt', locationId: state.currentLocationId }, atMs: Date.now() })}
                                >
                                    ⚔️ Hunt
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {activity.params.type === 'trade' && <MarketView state={state} dispatch={dispatch} content={content} />}


            {isTown && (
                <div className="training-section">
                    <div className="divider" style={{ width: '100%', height: '1px', background: '#333', margin: '1rem 0' }}></div>
                    <div style={{ color: '#666', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                        Training Grounds
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                            disabled={player.gold < 1}
                            style={{
                                ...(player.gold < 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                                ...(activity.params.type === 'train' && (activity.params as any).skillId === 'swordsmanship' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {})
                            }}
                            onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'swordsmanship' }, atMs: Date.now() })}
                        >
                            Train Sword (1g)
                        </button>
                        <button
                            disabled={player.gold < 1}
                            style={{
                                ...(player.gold < 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                                ...(activity.params.type === 'train' && (activity.params as any).skillId === 'defense' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {})
                            }}
                            onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'defense' }, atMs: Date.now() })}
                        >
                            Train Shield (1g)
                        </button>
                        <button
                            disabled={player.gold < 1}
                            style={{
                                ...(player.gold < 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                                ...(activity.params.type === 'train' && (activity.params as any).skillId === 'marksmanship' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {})
                            }}
                            onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'marksmanship' }, atMs: Date.now() })}
                        >
                            Train Archery (1g)
                        </button>
                        <button
                            disabled={player.gold < 1}
                            style={{
                                ...(player.gold < 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                                ...(activity.params.type === 'train' && (activity.params as any).skillId === 'arcana' ? { borderColor: 'var(--color-gold)', background: 'rgba(255, 215, 0, 0.1)' } : {})
                            }}
                            onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'train', skillId: 'arcana' }, atMs: Date.now() })}
                        >
                            Train Magic (1g)
                        </button>
                    </div>
                </div>
            )}

            {/* Stop */}
            <button
                className="primary"
                style={activity.params.type === 'idle' ? { opacity: 0.5 } : {}}
                onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}
            >
                Stop Activity
            </button>
        </section>
    );
}
