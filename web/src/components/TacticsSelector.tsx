import React from 'react';
import { PlayerState, PlayerCommand, TacticsPreset } from '@rpg-loom/shared';

interface Props {
    player: PlayerState;
    dispatch: (cmd: PlayerCommand) => void;
}

export function TacticsSelector({ player, dispatch }: Props) {
    const setTactics = (t: TacticsPreset) => {
        if (player.tactics === t) return;
        dispatch({ type: 'SET_TACTICS', tactics: t, atMs: Date.now() });
    };

    return (
        <div className="tactics-selector">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['aggressive', 'balanced', 'defensive'] as TacticsPreset[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTactics(t)}
                        style={{
                            flex: 1,
                            borderColor: player.tactics === t ? 'var(--color-gold)' : '#333',
                            background: player.tactics === t ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                            color: player.tactics === t ? 'var(--color-gold)' : 'var(--text-muted)',
                            padding: '0.5rem',
                            fontSize: '0.8rem'
                        }}
                    >
                        {t.toUpperCase()}
                    </button>
                ))}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
                {player.tactics === 'aggressive' && "Deal +20% damage. Take more risks."}
                {player.tactics === 'balanced' && "Standard combat performance."}
                {player.tactics === 'defensive' && "Deal -20% damage. Focus on survival."}
            </div>
        </div>
    );
}
