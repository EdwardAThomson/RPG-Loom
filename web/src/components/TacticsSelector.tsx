import { PlayerState, PlayerCommand, TacticsPreset } from '@rpg-loom/shared';

interface Props {
    player: PlayerState;
    dispatch: (cmd: PlayerCommand) => void;
}

const HINTS: Record<TacticsPreset, string> = {
    aggressive: 'Deal 20% more damage and take more risks.',
    balanced: 'Standard combat performance.',
    defensive: 'Deal 20% less damage and focus on survival.'
};

export function TacticsSelector({ player, dispatch }: Props) {
    const setTactics = (t: TacticsPreset) => {
        if (player.tactics === t) return;
        dispatch({ type: 'SET_TACTICS', tactics: t, atMs: Date.now() });
    };

    return (
        <div className="tactics">
            <div className="segmented" role="radiogroup" aria-label="Combat stance">
                {(['aggressive', 'balanced', 'defensive'] as TacticsPreset[]).map(t => (
                    <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={player.tactics === t}
                        className={player.tactics === t ? 'is-active' : ''}
                        onClick={() => setTactics(t)}
                    >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>
            <p className="hint">{HINTS[player.tactics]}</p>
        </div>
    );
}
