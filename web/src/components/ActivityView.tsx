import { EngineState, PlayerCommand } from '@rpg-loom/shared';
import { TacticsSelector } from './TacticsSelector';
import { useRef, useState } from 'react';
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
    const [isExpanded, setIsExpanded] = useState(false);

    const currentLocName = content?.locationsById?.[state.currentLocationId]?.name || state.currentLocationId;
    const isTown = content?.locationsById?.[state.currentLocationId]?.type === 'town';

    return (
        <>
            <section className="card">
                <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>Current Activity</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-gold)', textTransform: 'none', fontWeight: 'normal', opacity: 0.8, letterSpacing: '0.5px' }}>
                        {currentLocName}
                    </span>
                </h2>
                <div className="activity-status">
                    <div className="current-action">{activity.params.type.toUpperCase()}</div>
                    {'locationId' in activity.params && (
                        <div className="location">
                            {content?.locationsById?.[(activity.params as any).locationId]?.name || (activity.params as any).locationId}
                        </div>
                    )}

                    <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold', color: player.baseStats.hp < player.baseStats.hpMax * 0.3 ? '#ff4444' : 'var(--color-gold)' }}>
                        Player HP: {player.baseStats.hp} / {player.baseStats.hpMax}
                    </div>

                    {content?.locationsById?.[state.currentLocationId]?.image && (
                        <div
                            style={{
                                width: '100%',
                                margin: '0.5rem 0',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid #333',
                                maxHeight: '300px',
                                cursor: 'zoom-in',
                                position: 'relative',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                            }}
                            onClick={() => setIsExpanded(true)}
                            title="Click to expand"
                        >
                            <img
                                src={content.locationsById[state.currentLocationId].image}
                                alt={content.locationsById[state.currentLocationId].name}
                                style={{ width: '100%', height: '300px', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                            />
                            <div style={{
                                position: 'absolute',
                                bottom: '12px',
                                right: '12px',
                                background: 'rgba(0,0,0,0.7)',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                color: '#eee',
                                border: '1px solid #555',
                                backdropFilter: 'blur(4px)',
                                pointerEvents: 'none'
                            }}>
                                🔍 Click to Expand
                            </div>
                        </div>
                    )}

                    {state.activeEncounter && (
                        <div className="combat-widget">
                            <h3 style={{ color: '#ff4444', marginBottom: '0.5rem' }}>⚔️ Combat ⚔️</h3>
                            <div style={{ fontSize: '1.1rem' }}>
                                {content?.enemiesById?.[state.activeEncounter.enemyId]?.name || state.activeEncounter.enemyId}
                            </div>
                            <div style={{ color: '#888', fontSize: '0.9rem' }}>Lvl {state.activeEncounter.enemyLevel}</div>
                            <div style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>
                                HP: {state.activeEncounter.enemyHp} / {state.activeEncounter.enemyMaxHp}
                            </div>
                        </div>
                    )}
                </div>

                {state.activeEncounter && (
                    <section style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', color: '#888', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Combat Stance</h3>
                        <TacticsSelector player={player} dispatch={dispatch} />
                    </section>
                )}

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

                                {/* Market */}
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
                                {/* Wild Actions */}
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
                    style={activity.params.type === 'idle' ? { opacity: 0.5, marginTop: '1rem' } : { marginTop: '1rem' }}
                    onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}
                >
                    Stop Activity
                </button>
            </section>

            {/* Fullscreen Expansion Modal - Rendered outside the card to avoid stacking context issues */}
            {isExpanded && content?.locationsById?.[state.currentLocationId]?.image && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(0,0,0,0.95)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9999,
                        cursor: 'zoom-out',
                        backdropFilter: 'blur(12px)',
                        padding: '2rem'
                    }}
                    onClick={() => setIsExpanded(false)}
                >
                    <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'flex', justifyContent: 'center' }}>
                        <img
                            src={content.locationsById[state.currentLocationId].image}
                            alt={content.locationsById[state.currentLocationId].name}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '90vh',
                                objectFit: 'contain',
                                boxShadow: '0 0 60px rgba(0,0,0,1)',
                                borderRadius: '8px',
                                border: '1px solid #444'
                            }}
                        />
                        <div style={{
                            position: 'absolute',
                            top: '-50px',
                            width: '100%',
                            textAlign: 'center',
                            color: 'var(--color-gold)',
                            fontFamily: 'Cinzel, serif',
                            fontSize: '1.5rem',
                            textShadow: '0 2px 10px rgba(0,0,0,1)'
                        }}>
                            {content.locationsById[state.currentLocationId].name}
                        </div>
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                        style={{
                            position: 'absolute',
                            top: '30px',
                            right: '30px',
                            background: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '50%',
                            width: '50px',
                            height: '50px',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            transition: 'background 0.2s'
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    );
}
