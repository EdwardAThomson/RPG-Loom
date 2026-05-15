import type { ContentIndex, OfflineSummary } from '@rpg-loom/shared';

interface Props {
    summary: OfflineSummary;
    content: ContentIndex;
    onClose: () => void;
}

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function topEntries<T extends Record<string, number>>(rec: T, limit: number): Array<[string, number]> {
    return Object.entries(rec)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
}

export function OfflineSummaryModal({ summary, content, onClose }: Props) {
    const killEntries = topEntries(summary.kills, 6);
    const lootEntries = topEntries(summary.loot, 8);
    const wasIdle =
        killEntries.length === 0 &&
        lootEntries.length === 0 &&
        summary.xpGained === 0 &&
        summary.goldDelta === 0 &&
        summary.questsCompleted === 0;

    return (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)', zIndex: 2100,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onClick={onClose}
        >
            <div
                className="card"
                style={{ maxWidth: '520px', width: '90%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #666' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                    <h2 style={{ margin: 0 }}>Welcome back</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer' }}
                    >
                        &times;
                    </button>
                </div>

                <p style={{ color: '#ccc', marginTop: 0 }}>
                    You were away for <strong>{formatDuration(summary.durationMs)}</strong>.
                    {summary.cappedAtMs && (
                        <span style={{ color: '#ffa000', marginLeft: '0.5rem' }}>
                            (capped at 24h of simulation)
                        </span>
                    )}
                </p>

                {wasIdle ? (
                    <p style={{ color: '#888', fontStyle: 'italic' }}>
                        Nothing happened — your hero was idle.
                    </p>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                            <Stat label="XP gained" value={summary.xpGained.toLocaleString()} accent="#fff" />
                            <Stat label="Gold" value={(summary.goldDelta >= 0 ? '+' : '') + summary.goldDelta.toLocaleString()} accent="var(--color-gold)" />
                            <Stat label="Quests completed" value={String(summary.questsCompleted)} />
                            <Stat label="Level-ups" value={String(summary.levelUps)} />
                        </div>

                        {killEntries.length > 0 && (
                            <Section title="Combat">
                                {killEntries.map(([enemyId, count]) => (
                                    <Row
                                        key={enemyId}
                                        label={content.enemiesById[enemyId]?.name ?? enemyId}
                                        value={`× ${count}`}
                                    />
                                ))}
                            </Section>
                        )}

                        {lootEntries.length > 0 && (
                            <Section title="Loot">
                                {lootEntries.map(([itemId, qty]) => (
                                    <Row
                                        key={itemId}
                                        label={content.itemsById[itemId]?.name ?? itemId}
                                        value={`+ ${qty}`}
                                    />
                                ))}
                            </Section>
                        )}
                    </>
                )}

                <button
                    onClick={onClose}
                    style={{
                        marginTop: '1rem',
                        padding: '0.6rem 1.2rem',
                        background: '#444',
                        color: '#fff',
                        border: '1px solid #666',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%'
                    }}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div style={{ background: '#1c1c1c', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #2c2c2c' }}>
            <div style={{ fontSize: '1.1rem', color: accent ?? '#fff' }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem 0' }}>{title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0.5rem', background: '#1a1a1a', borderRadius: '3px' }}>
            <span style={{ color: '#ccc' }}>{label}</span>
            <span style={{ color: '#fff' }}>{value}</span>
        </div>
    );
}
