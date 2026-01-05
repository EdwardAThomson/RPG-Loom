import React from 'react';
import { EngineState } from '@rpg-loom/shared';

interface Props {
    state: EngineState;
    content: any;
}

export function QuestView({ state, content }: Props) {
    const activeQuests = state.quests.filter(q => q.status === 'active');
    const completedQuests = state.quests.filter(q => q.status === 'completed');

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <section className="card">
                <h2>Active Quests</h2>
                {activeQuests.length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>No active quests. Explore to find some!</div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {activeQuests.map(q => {
                            const tmpl = content?.questTemplatesById?.[q.templateId];
                            const questName = tmpl?.name || q.templateId.replace('qt_', '').replace(/_/g, ' ').toUpperCase();

                            return (
                                <div key={q.id} style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '1.1rem', color: 'var(--color-gold)', marginBottom: '0.5rem' }}>
                                        {questName}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ flex: 1, height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${(q.progress.current / q.progress.required) * 100}%`,
                                                height: '100%',
                                                background: 'var(--color-success)'
                                            }}></div>
                                        </div>
                                        <div style={{ fontSize: '0.9rem' }}>{q.progress.current} / {q.progress.required}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="card">
                <h2>Completed</h2>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>
                    {completedQuests.length} quests completed.
                </div>
            </section>
        </div>
    );
}
