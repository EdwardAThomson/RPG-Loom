import React, { useState } from 'react';
import { EngineState, PlayerCommand, QuestTemplateDef } from '@rpg-loom/shared';
import { enhanceQuest } from '../services/questEnhancement';

interface Props {
    state: EngineState;
    content: any;
    dispatch: (cmd: PlayerCommand) => void;
}

export function QuestView({ state, content, dispatch }: Props) {
    const [enhancingQuest, setEnhancingQuest] = useState<string | null>(null);
    const [enhanceError, setEnhanceError] = useState<string | null>(null);

    const activeQuests = state.quests.filter(q => q.status === 'active');
    const completedQuests = state.quests.filter(q => q.status === 'completed');

    // Get available quests for current location
    const availableQuests: QuestTemplateDef[] = [];
    if (content?.questTemplatesById) {
        const activeTemplateIds = new Set(state.quests.map(q => q.templateId));

        for (const [templateId, template] of Object.entries(content.questTemplatesById)) {
            const tmpl = template as QuestTemplateDef;
            // Show quest if:
            // 1. Player is in a location that matches the quest's locationPool
            // 2. Quest is not already active or completed
            const isInLocation = tmpl.locationPool.includes(state.currentLocationId);
            const notTaken = !activeTemplateIds.has(templateId);

            if (isInLocation && notTaken) {
                availableQuests.push(tmpl);
            }
        }
    }

    // Sort by difficulty
    availableQuests.sort((a, b) => a.difficulty - b.difficulty);

    const handleAcceptQuest = (templateId: string) => {
        dispatch({
            type: 'ACCEPT_QUEST',
            templateId,
            atMs: Date.now()
        });
    };

    const handleAbandonQuest = (questId: string) => {
        if (window.confirm('Are you sure you want to abandon this quest?')) {
            dispatch({
                type: 'ABANDON_QUEST',
                questId,
                atMs: Date.now()
            });
        }
    };

    const handleStartQuestActivity = (questId: string) => {
        dispatch({
            type: 'SET_ACTIVITY',
            params: { type: 'quest', questId },
            atMs: Date.now()
        });
    };

    const handleEnhanceQuest = async (questId: string) => {
        const quest = state.quests.find(q => q.id === questId);
        if (!quest) return;

        const template = content?.questTemplatesById?.[quest.templateId];
        if (!template) return;

        setEnhancingQuest(questId);
        setEnhanceError(null);

        try {
            const narrative = await enhanceQuest(quest, template, content);

            dispatch({
                type: 'ENHANCE_QUEST',
                questId,
                narrative,
                atMs: Date.now()
            });
        } catch (error: any) {
            console.error('Failed to enhance quest:', error);
            setEnhanceError(error.message || 'Failed to generate narrative');
        } finally {
            setEnhancingQuest(null);
        }
    };

    const getDifficultyStars = (difficulty: number) => {
        return '⭐'.repeat(difficulty);
    };

    const getObjectiveText = (tmpl: QuestTemplateDef) => {
        const qty = `${tmpl.qtyMin}${tmpl.qtyMin !== tmpl.qtyMax ? `-${tmpl.qtyMax}` : ''}`;

        switch (tmpl.objectiveType) {
            case 'kill':
                const enemyName = content?.enemiesById?.[tmpl.targetEnemyId || '']?.name || tmpl.targetEnemyId;
                return `Kill ${qty} ${enemyName}`;
            case 'gather':
                const itemName = content?.itemsById?.[tmpl.targetItemId || '']?.name || tmpl.targetItemId;
                return `Gather ${qty} ${itemName}`;
            case 'craft':
                const recipeName = content?.recipesById?.[tmpl.targetRecipeId || '']?.name || tmpl.targetRecipeId;
                return `Craft ${qty} ${recipeName}`;
            default:
                return tmpl.objectiveType;
        }
    };

    const formatRewards = (rewards: any) => {
        const parts: string[] = [];
        if (rewards.xp) parts.push(`${rewards.xp} XP`);
        if (rewards.gold) parts.push(`${rewards.gold}g`);
        if (rewards.items?.length) {
            rewards.items.forEach((item: any) => {
                const itemName = content?.itemsById?.[item.itemId]?.name || item.itemId;
                parts.push(`${item.qty}x ${itemName}`);
            });
        }
        return parts.join(', ');
    };

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Quest Board - Available Quests */}
            <section className="card">
                <h2>Quest Board</h2>
                {availableQuests.length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>
                        No quests available at this location. Try exploring other areas!
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {availableQuests.map(tmpl => (
                            <div
                                key={tmpl.id}
                                style={{
                                    padding: '1rem',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid #444',
                                    borderRadius: '8px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                                    <div style={{ fontSize: '1.1rem', color: 'var(--color-gold)', fontWeight: 'bold' }}>
                                        {tmpl.name || tmpl.id}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#ffa500' }}>
                                        {getDifficultyStars(tmpl.difficulty)}
                                    </div>
                                </div>

                                <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>
                                    {tmpl.description || 'No description available.'}
                                </div>

                                <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.5rem' }}>
                                    <strong>Objective:</strong> {getObjectiveText(tmpl)}
                                </div>

                                <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', marginBottom: '0.75rem' }}>
                                    <strong>Rewards:</strong> {formatRewards(tmpl.rewardPack)}
                                </div>

                                <button
                                    onClick={() => handleAcceptQuest(tmpl.id)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'var(--color-primary)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Accept Quest
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Active Quests */}
            <section className="card">
                <h2>Active Quests</h2>
                {activeQuests.length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>
                        No active quests. Visit the Quest Board above to accept one!
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {activeQuests.map(q => {
                            const tmpl = content?.questTemplatesById?.[q.templateId];
                            const questName = tmpl?.name || q.templateId.replace('qt_', '').replace(/_/g, ' ').toUpperCase();
                            const isQuestActivity = state.activity.params.type === 'quest' &&
                                'questId' in state.activity.params &&
                                state.activity.params.questId === q.id;

                            return (
                                <div
                                    key={q.id}
                                    style={{
                                        padding: '1rem',
                                        background: 'rgba(0,0,0,0.3)',
                                        border: isQuestActivity ? '2px solid var(--color-primary)' : '1px solid #444',
                                        borderRadius: '8px'
                                    }}
                                >
                                    <div style={{ fontSize: '1.1rem', color: 'var(--color-gold)', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                        {q.aiNarrative?.title || questName}
                                        {q.aiNarrative && (
                                            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#9333ea' }}>
                                                ✨ AI
                                            </span>
                                        )}
                                        {isQuestActivity && (
                                            <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                                                (Active)
                                            </span>
                                        )}
                                    </div>

                                    {q.aiNarrative?.description && (
                                        <div style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                                            {q.aiNarrative.description}
                                        </div>
                                    )}

                                    {tmpl && (
                                        <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.5rem' }}>
                                            {getObjectiveText(tmpl)}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                                        <div style={{ flex: 1, height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${Math.min(100, (q.progress.current / q.progress.required) * 100)}%`,
                                                height: '100%',
                                                background: 'var(--color-success)',
                                                transition: 'width 0.3s ease'
                                            }}></div>
                                        </div>
                                        <div style={{ fontSize: '0.9rem', minWidth: '60px', textAlign: 'right' }}>
                                            {q.progress.current} / {q.progress.required}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => handleStartQuestActivity(q.id)}
                                            disabled={isQuestActivity}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: isQuestActivity ? '#555' : 'var(--color-primary)',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                cursor: isQuestActivity ? 'not-allowed' : 'pointer',
                                                fontSize: '0.85rem',
                                                opacity: isQuestActivity ? 0.6 : 1
                                            }}
                                        >
                                            {isQuestActivity ? 'In Progress' : 'Start Quest'}
                                        </button>
                                        <button
                                            onClick={() => handleAbandonQuest(q.id)}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: 'transparent',
                                                border: '1px solid #666',
                                                borderRadius: '4px',
                                                color: '#888',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            Abandon
                                        </button>
                                        <button
                                            onClick={() => handleEnhanceQuest(q.id)}
                                            disabled={enhancingQuest === q.id || !!q.aiNarrative}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: q.aiNarrative ? '#4a1d7a' : '#9333ea',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: '#fff',
                                                cursor: (enhancingQuest === q.id || q.aiNarrative) ? 'not-allowed' : 'pointer',
                                                fontSize: '0.85rem',
                                                opacity: (enhancingQuest === q.id || q.aiNarrative) ? 0.6 : 1
                                            }}
                                        >
                                            {enhancingQuest === q.id ? '✨ Enhancing...' : q.aiNarrative ? '✨ Enhanced' : '✨ Enhance with AI'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Completed Quests */}
            <section className="card">
                <h2>Completed</h2>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>
                    {completedQuests.length} quest{completedQuests.length !== 1 ? 's' : ''} completed.
                </div>
            </section>
        </div>
    );
}
