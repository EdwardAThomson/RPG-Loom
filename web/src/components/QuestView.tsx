import React, { useState } from 'react';
import { EngineState, PlayerCommand, QuestTemplateDef } from '@rpg-loom/shared';
import { getAvailableQuests } from '@rpg-loom/engine';
import { enhanceQuest } from '../services/questEnhancement';
import { generateAdventureQuest } from '../services/adventureQuestGeneration';

interface Props {
    state: EngineState;
    content: any;
    dispatch: (cmd: PlayerCommand) => void;
}

export function QuestView({ state, content, dispatch }: Props) {
    const [enhancingQuest, setEnhancingQuest] = useState<string | null>(null);
    const [enhanceError, setEnhanceError] = useState<string | null>(null);
    const [generatingAdventure, setGeneratingAdventure] = useState(false);
    const [adventureError, setAdventureError] = useState<string | null>(null);

    const activeQuests = state.quests.filter(q => q.status === 'active');
    const completedQuests = state.quests.filter(q => q.status === 'completed');

    // Get available quests using new filtering logic
    const availableQuests = content ? getAvailableQuests(state, content) : [];

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

    const handleStartAdventure = (questId: string) => {
        dispatch({
            type: 'SET_ACTIVITY',
            params: { type: 'adventure', questId },
            atMs: Date.now()
        });
    };

    const handleGenerateAdventure = async () => {
        setGeneratingAdventure(true);
        setAdventureError(null);

        try {
            const spec = await generateAdventureQuest(
                state.currentLocationId,
                state.player.level,
                content
            );

            dispatch({
                type: 'GENERATE_ADVENTURE_QUEST',
                locationId: state.currentLocationId,
                adventureSpec: spec,
                atMs: Date.now()
            });
        } catch (error: any) {
            console.error('Failed to generate adventure:', error);
            setAdventureError(error.message || 'Failed to generate adventure quest');
        } finally {
            setGeneratingAdventure(false);
        }
    };

    const getDifficultyStars = (difficulty: number) => {
        return '⭐'.repeat(difficulty);
    };

    const getObjectiveText = (tmpl: QuestTemplateDef) => {
        const qty = `${tmpl.qtyMin}${tmpl.qtyMin !== tmpl.qtyMax ? `-${tmpl.qtyMax}` : ''} `;

        switch (tmpl.objectiveType) {
            case 'kill':
                const enemyName = content?.enemiesById?.[tmpl.targetEnemyId || '']?.name || tmpl.targetEnemyId;
                return `Kill ${qty} ${enemyName} `;
            case 'gather':
                const itemName = content?.itemsById?.[tmpl.targetItemId || '']?.name || tmpl.targetItemId;
                return `Gather ${qty} ${itemName} `;
            case 'craft':
                const recipeName = content?.recipesById?.[tmpl.targetRecipeId || '']?.name || tmpl.targetRecipeId;
                return `Craft ${qty} ${recipeName} `;
            default:
                return tmpl.objectiveType;
        }
    };

    const formatRewards = (rewards: any) => {
        const parts: string[] = [];
        if (rewards.xp) parts.push(`${rewards.xp} XP`);
        if (rewards.gold) parts.push(`${rewards.gold} g`);
        if (rewards.items?.length) {
            rewards.items.forEach((item: any) => {
                const itemName = content?.itemsById?.[item.itemId]?.name || item.itemId;
                parts.push(`${item.qty}x ${itemName} `);
            });
        }
        return parts.join(', ');
    };

    // Get current location name
    const currentLocation = content?.locationsById?.[state.currentLocationId];
    const locationName = currentLocation?.name || state.currentLocationId;

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Quest Board - Available Quests */}
            <section className="card">
                <h2>Quest Board</h2>
                <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1rem' }}>
                    Current Location: <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{locationName}</span>
                </div>
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

                {/* Generate AI Adventure Button */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #444' }}>
                    <button
                        onClick={handleGenerateAdventure}
                        disabled={generatingAdventure}
                        style={{
                            width: '100%',
                            padding: '0.75rem 1.5rem',
                            background: generatingAdventure
                                ? '#555'
                                : 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            cursor: generatingAdventure ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            opacity: generatingAdventure ? 0.6 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        {generatingAdventure ? '✨ Generating Adventure...' : '✨ Generate AI Adventure Quest'}
                    </button>
                    {adventureError && (
                        <div style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            color: '#ef4444',
                            fontSize: '0.85rem'
                        }}>
                            {adventureError}
                        </div>
                    )}
                </div>
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
                            const isAdventure = q.templateId === 'dynamic_adventure';
                            const isQuestActivity = (
                                (state.activity.params.type === 'quest' && 'questId' in state.activity.params && state.activity.params.questId === q.id) ||
                                (state.activity.params.type === 'adventure' && 'questId' in state.activity.params && state.activity.params.questId === q.id)
                            );

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
                                                width: `${Math.min(100, (q.progress.current / q.progress.required) * 100)}% `,
                                                height: '100%',
                                                background: 'var(--color-success)',
                                                transition: 'width 0.3s ease'
                                            }}></div>
                                        </div>
                                        <div style={{ fontSize: '0.9rem', minWidth: '60px', textAlign: 'right' }}>
                                            {q.progress.current} / {q.progress.required}
                                        </div>
                                    </div>

                                    {/* Adventure Steps Display */}
                                    {q.adventureSteps && (
                                        <div style={{ marginTop: '0.75rem', paddingLeft: '1rem', borderLeft: '2px solid #9333ea' }}>
                                            <div style={{ fontSize: '0.85rem', color: '#9333ea', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                                Adventure Progress:
                                            </div>
                                            {q.adventureSteps.map(step => {
                                                const stepLocation = step.locationId ? content?.locationsById[step.locationId] : null;
                                                const isCurrentLocation = !step.locationId || step.locationId === state.currentLocationId;
                                                const canProgress = step.completed || (
                                                    isCurrentLocation &&
                                                    q.adventureSteps!.slice(0, step.stepNumber - 1).every(s => s.completed)
                                                );

                                                return (
                                                    <div key={step.stepNumber} style={{
                                                        fontSize: '0.85rem',
                                                        color: step.completed ? '#4ade80' : (canProgress ? '#fff' : '#666'),
                                                        marginBottom: '0.5rem',
                                                        display: 'flex',
                                                        alignItems: 'start',
                                                        gap: '0.5rem'
                                                    }}>
                                                        <span style={{ minWidth: '20px' }}>
                                                            {step.completed ? '✓' : (canProgress ? '○' : '🔒')}
                                                        </span>
                                                        <div style={{ flex: 1 }}>
                                                            <div>{step.description}</div>
                                                            {stepLocation && (
                                                                <div style={{
                                                                    fontSize: '0.75rem',
                                                                    color: isCurrentLocation ? '#4ade80' : '#fbbf24',
                                                                    marginTop: '0.25rem'
                                                                }}>
                                                                    📍 {stepLocation.name}
                                                                    {!isCurrentLocation && ' (Travel required)'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => isAdventure ? handleStartAdventure(q.id) : handleStartQuestActivity(q.id)}
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
