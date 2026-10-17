import type { ReactNode } from 'react';
import type { ContentIndex, OfflineSummary } from '@rpg-loom/shared';
import { Modal } from './Modal';

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
        <Modal title="Welcome back" zIndex={2100} onClose={onClose}>
            <p className="prose">
                You were away for <strong>{formatDuration(summary.durationMs)}</strong>.
                {summary.cappedAtMs && (
                    <span className="warn"> (capped at 24h of simulation)</span>
                )}
            </p>

            {wasIdle ? (
                <p className="empty">
                    Nothing happened — your hero was idle.
                </p>
            ) : (
                <>
                    <div className="stat-grid">
                        <Stat label="XP gained" value={summary.xpGained.toLocaleString()} />
                        <Stat label="Gold" value={(summary.goldDelta >= 0 ? '+' : '') + summary.goldDelta.toLocaleString()} gold />
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

            <div className="section">
                <button type="button" className="primary btn-block" onClick={onClose}>
                    Continue
                </button>
            </div>
        </Modal>
    );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
    return (
        <div className={gold ? 'stat-tile is-gold' : 'stat-tile'}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="section">
            <div className="hud-label">{title}</div>
            <div>{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="kv">
            <span className="k">{label}</span>
            <span className="v">{value}</span>
        </div>
    );
}
