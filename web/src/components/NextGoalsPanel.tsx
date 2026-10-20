import type { Goal } from '@rpg-loom/shared';
import type { TabId } from './Navigation';

interface Props {
    goals: Goal[];
    onJumpTo: (tab: TabId) => void;
}

export function NextGoalsPanel({ goals, onJumpTo }: Props) {
    return (
        <section className="hud-panel goals" aria-label="Next goals" data-tour="goals">
            <div className="hud-label">Next goals</div>
            {goals.length === 0 ? (
                <p className="goals-empty">Nothing pressing. Explore, train, or pick up a quest.</p>
            ) : (
                goals.map(goal => <GoalRow key={goal.id} goal={goal} onJumpTo={onJumpTo} />)
            )}
        </section>
    );
}

function GoalRow({ goal, onJumpTo }: { goal: Goal; onJumpTo: (tab: TabId) => void }) {
    const pct = goal.progress.required > 0
        ? Math.max(0, Math.min(100, (goal.progress.current / goal.progress.required) * 100))
        : 0;
    const tab = goal.actionHint?.tab;

    return (
        <button
            type="button"
            className="goal"
            disabled={!tab}
            onClick={() => tab && onJumpTo(tab as TabId)}
        >
            <span className="goal-row">
                <span className="goal-label">{goal.label}</span>
                <span className="goal-count">{goal.progress.current}/{goal.progress.required}</span>
            </span>
            <span className={`bar bar-sm cat-${goal.category}`}><i style={{ width: `${pct}%` }} /></span>
        </button>
    );
}
