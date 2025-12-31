import React from 'react';
import { EngineState, PlayerCommand, TacticsPreset } from '@rpg-loom/shared';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
}

export function CharacterView({ state, dispatch }: Props) {
    const { player } = state;
    const stats = player.baseStats;

    const setTactics = (t: TacticsPreset) => {
        if (player.tactics === t) return;
        dispatch({ type: 'SET_TACTICS', tactics: t, atMs: Date.now() });
    };

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Tactics Selector */}
            <section className="card">
                <h2>Combat Tactics</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['aggressive', 'balanced', 'defensive'] as TacticsPreset[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTactics(t)}
                            style={{
                                flex: 1,
                                borderColor: player.tactics === t ? 'var(--color-gold)' : '#333',
                                background: player.tactics === t ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                                color: player.tactics === t ? 'var(--color-gold)' : 'var(--text-muted)'
                            }}
                        >
                            {t.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div style={{ marginTop: '0.8rem', fontSize: '0.9rem', color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
                    {player.tactics === 'aggressive' && "Deal +20% damage. Take more risks."}
                    {player.tactics === 'balanced' && "Standard combat performance."}
                    {player.tactics === 'defensive' && "Deal -20% damage. Focus on survival."}
                </div>
            </section>

            <section className="card">
                <h2>Attributes</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>ATK: {stats.atk}</div>
                    <div>DEF: {stats.def}</div>
                    <div>SPD: {stats.spd}</div>
                    <div>CRIT: {Math.round(stats.critChance * 100)}%</div>
                    <div>MULT: {stats.critMult}x</div>
                    <div>RES: {Math.round(stats.res * 100)}%</div>
                </div>
            </section>

            <section className="card">
                <h2>Skills</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                    {Object.values(player.skills).map((skill: any) => (
                        <div key={skill.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333' }}>
                            <div style={{ textTransform: 'capitalize', color: 'var(--color-gold)' }}>{skill.id}</div>
                            <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Lvl {skill.level}</div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>XP: {Math.floor(skill.xp)}</div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
