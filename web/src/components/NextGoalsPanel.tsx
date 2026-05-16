import type { Goal } from '@rpg-loom/shared';
import type { TabId } from './Navigation';

interface Props {
    goals: Goal[];
    onJumpTo: (tab: TabId) => void;
}

export function NextGoalsPanel({ goals, onJumpTo }: Props) {
    if (goals.length === 0) {
        return (
            <div style={panelStyle}>
                <Header />
                <p style={{ margin: 0, color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    Nothing pressing — explore, train, or pick up a quest.
                </p>
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            <Header />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {goals.map(goal => (
                    <GoalRow
                        key={goal.id}
                        goal={goal}
                        onJumpTo={onJumpTo}
                    />
                ))}
            </div>
        </div>
    );
}

const panelStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    background: 'var(--bg-panel, #1c1c1c)',
    border: '1px solid #333',
    borderRadius: '6px',
    marginBottom: '1rem'
};

function Header() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Next Goals
            </span>
        </div>
    );
}

function GoalRow({ goal, onJumpTo }: { goal: Goal; onJumpTo: (tab: TabId) => void }) {
    const pct = goal.progress.required > 0
        ? Math.max(0, Math.min(100, Math.round((goal.progress.current / goal.progress.required) * 100)))
        : 0;

    const tab = goal.actionHint?.tab;
    const clickable = !!tab;

    return (
        <button
            type="button"
            disabled={!clickable}
            onClick={() => tab && onJumpTo(tab as TabId)}
            style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: '#181818',
                border: '1px solid #2a2a2a',
                borderRadius: '4px',
                padding: '0.5rem 0.75rem',
                color: 'inherit',
                cursor: clickable ? 'pointer' : 'default',
                font: 'inherit'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{goal.label}</span>
                <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {goal.progress.current} / {goal.progress.required}
                </span>
            </div>
            <div style={{ height: '4px', background: '#2a2a2a', borderRadius: '2px', overflow: 'hidden' }}>
                <div
                    style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: colorForCategory(goal.category),
                        transition: 'width 0.3s ease'
                    }}
                />
            </div>
        </button>
    );
}

function colorForCategory(category: Goal['category']): string {
    switch (category) {
        case 'quest': return 'var(--color-combat, #d97757)';
        case 'recipe': return 'var(--color-gold, #d4af37)';
        case 'location': return '#5a9fd4';
        case 'skill': return '#8fbc8f';
        case 'reputation': return '#b294bb';
    }
}
