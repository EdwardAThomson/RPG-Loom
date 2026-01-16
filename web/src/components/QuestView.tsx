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

    // Filter out sub-quests that belong to inactive adventures
    const activeQuests = state.quests.filter(q => {
        if (q.status !== 'active') return false;

        // If this is a sub-quest (dynamic_* but NOT dynamic_adventure), only show it if:
        // 1. Its parent adventure step is active (so user can start it), OR
        // 2. The sub-quest itself is the active quest activity (so it stays visible while working)
        if (q.templateId.startsWith('dynamic_') && q.templateId !== 'dynamic_adventure') {
            // Find the parent adventure quest
            const parentAdventure = state.quests.find(parent =>
                parent.adventureSteps?.some(step => step.subQuestId === q.id)
            );

            if (parentAdventure && parentAdventure.adventureSteps) {
                // Find the step this sub-quest belongs to
                const parentStep = parentAdventure.adventureSteps.find(step => step.subQuestId === q.id);

                // Show if the parent step is active (not locked, not completed)
                if (parentStep && parentStep.status === 'active') {
                    return true;
                }

                // Also show if this sub-quest is currently being worked on
                const isActiveQuestActivity = state.activity.params.type === 'quest' &&
                    'questId' in state.activity.params &&
                    state.activity.params.questId === q.id;
                if (isActiveQuestActivity) {
                    return true;
                }
            }

            return false;
        }

        return true;
    });
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
                            // Dynamic sub-quests don't have templates in questTemplatesById
                            const tmpl = q.templateId.startsWith('dynamic_') && q.templateId !== 'dynamic_adventure'
                                ? null
                                : content?.questTemplatesById?.[q.templateId];
                            const questName = tmpl?.name || q.aiNarrative?.title || q.templateId.replace('qt_', '').replace(/_/g, ' ').toUpperCase();
                            const isAdventure = q.templateId === 'dynamic_adventure';

                            // Check if this quest or any of its sub-quests are active
                            let isQuestActivity = false;
                            if (isAdventure) {
                                // For adventures, check if the adventure itself OR any of its sub-quests are active
                                isQuestActivity = state.activity.params.type === 'adventure' &&
                                    'questId' in state.activity.params &&
                                    state.activity.params.questId === q.id;

                                // Also check if any sub-quest is the active quest activity or related activity
                                if (!isQuestActivity && q.adventureSteps) {
                                    const activeSubQuestId = q.adventureSteps.find(step => {
                                        if (!step.subQuestId) return false;

                                        // Check if this sub-quest is the active quest activity
                                        if (state.activity.params.type === 'quest' &&
                                            'questId' in state.activity.params &&
                                            state.activity.params.questId === step.subQuestId) {
                                            return true;
                                        }

                                        // Check if this is a gather/explore quest with matching activity
                                        const subQuest = state.quests.find(sq => sq.id === step.subQuestId);
                                        if (subQuest) {
                                            // For gather quests, check if we're in a gathering activity at the quest location
                                            if (subQuest.templateId.startsWith('dynamic_gather_') &&
                                                (state.activity.params.type === 'mine' ||
                                                    state.activity.params.type === 'woodcut' ||
                                                    state.activity.params.type === 'forage') &&
                                                'locationId' in state.activity.params &&
                                                state.activity.params.locationId === subQuest.locationId) {
                                                return true;
                                            }
                                            // For explore quests, check if we're exploring at the quest location
                                            if (subQuest.templateId === 'dynamic_explore' &&
                                                state.activity.params.type === 'explore' &&
                                                'locationId' in state.activity.params &&
                                                state.activity.params.locationId === subQuest.locationId) {
                                                return true;
                                            }
                                        }
                                        return false;
                                    });
                                    isQuestActivity = !!activeSubQuestId;
                                }
                            } else {
                                // For regular quests (including sub-quests), check if this quest is active
                                // First check for direct quest activity
                                isQuestActivity = state.activity.params.type === 'quest' &&
                                    'questId' in state.activity.params &&
                                    state.activity.params.questId === q.id;

                                // For dynamic gather quests, also check if we're in the corresponding gathering activity
                                if (!isQuestActivity && q.templateId.startsWith('dynamic_gather_')) {
                                    isQuestActivity = (state.activity.params.type === 'mine' ||
                                        state.activity.params.type === 'woodcut' ||
                                        state.activity.params.type === 'forage') &&
                                        'locationId' in state.activity.params &&
                                        state.activity.params.locationId === q.locationId;
                                }

                                // For dynamic explore quests, check if we're exploring at the quest location
                                if (!isQuestActivity && q.templateId === 'dynamic_explore') {
                                    isQuestActivity = state.activity.params.type === 'explore' &&
                                        'locationId' in state.activity.params &&
                                        state.activity.params.locationId === q.locationId;
                                }

                                // For dynamic kill quests, check if we're in combat (hunt activity)
                                if (!isQuestActivity && q.templateId.startsWith('dynamic_kill_')) {
                                    isQuestActivity = state.activity.params.type === 'hunt' &&
                                        'locationId' in state.activity.params &&
                                        state.activity.params.locationId === q.locationId;
                                }

                                // For dynamic craft quests, check if we're in crafting activity with target recipe
                                if (!isQuestActivity && q.templateId.startsWith('dynamic_craft_')) {
                                    const targetRecipeId = q.templateId.replace('dynamic_craft_', '');
                                    isQuestActivity = state.activity.params.type === 'craft' &&
                                        'recipeId' in state.activity.params &&
                                        state.activity.params.recipeId === targetRecipeId;
                                }
                            }

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
                                    {q.adventureSteps && q.adventureSteps.length > 0 && (() => {
                                        // Debug logging
                                        console.log('Adventure steps for quest:', q.id, q.adventureSteps);

                                        // Handle both old and new formats
                                        const stepsToDisplay = q.adventureSteps.map((step: any) => {
                                            // Old format: { stepNumber, description, locationId, completed }
                                            // New format: { stepNumber, template, narrative, status, subQuestId }

                                            if (step.template) {
                                                // New format - use as-is
                                                return step;
                                            } else if (step.description) {
                                                // Old format - convert to new format for display
                                                const previousStep = q.adventureSteps!.find((s: any) => s.stepNumber === step.stepNumber - 1);
                                                return {
                                                    stepNumber: step.stepNumber,
                                                    status: step.completed ? 'completed' :
                                                        (step.stepNumber === 1 || (previousStep && (('completed' in previousStep && previousStep.completed) || previousStep.status === 'completed')))
                                                            ? 'active' : 'locked',
                                                    template: step.locationId ? {
                                                        type: 'explore' as const,
                                                        targetLocationId: step.locationId,
                                                        durationMs: 30000
                                                    } : null,
                                                    narrative: {
                                                        description: step.description
                                                    }
                                                };
                                            }
                                            return null;
                                        }).filter((step: any) => step !== null);

                                        console.log('Steps to display:', stepsToDisplay.length);

                                        return (
                                            <div style={{ marginTop: '0.75rem', paddingLeft: '1rem', borderLeft: '2px solid #9333ea' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#9333ea', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                                    Adventure Progress:
                                                </div>
                                                {stepsToDisplay.length === 0 ? (
                                                    <div style={{ fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>
                                                        ⚠️ Quest data is incomplete. Try abandoning and generating a new adventure.
                                                    </div>
                                                ) : (
                                                    stepsToDisplay.map((step: any, idx: number) => {
                                                        const statusIcon = step.status === 'completed' ? '✓' :
                                                            step.status === 'active' ? '→' : '🔒';
                                                        const statusColor = step.status === 'completed' ? '#4ade80' :
                                                            step.status === 'active' ? '#fbbf24' : '#666';

                                                        // Get location for travel/explore/deliver steps
                                                        let stepLocation = null;
                                                        let targetLocationId: string | null = null;
                                                        if (step.template?.type === 'travel') {
                                                            targetLocationId = step.template.targetLocationId;
                                                        } else if (step.template?.type === 'explore') {
                                                            targetLocationId = step.template.targetLocationId;
                                                        } else if (step.template?.type === 'deliver') {
                                                            targetLocationId = step.template.targetLocationId;
                                                        }
                                                        if (targetLocationId) {
                                                            stepLocation = content?.locationsById[targetLocationId];
                                                        }

                                                        // Get sub-quest if it exists
                                                        const subQuest = step.subQuestId ?
                                                            state.quests.find(sq => sq.id === step.subQuestId) : null;

                                                        return (
                                                            <div key={step.stepNumber} style={{
                                                                fontSize: '0.85rem',
                                                                color: statusColor,
                                                                marginBottom: '0.5rem',
                                                                display: 'flex',
                                                                alignItems: 'start',
                                                                gap: '0.5rem'
                                                            }}>
                                                                <span style={{ minWidth: '20px' }}>
                                                                    {statusIcon}
                                                                </span>
                                                                <div style={{ flex: 1 }}>
                                                                    <div>{step.narrative?.description || 'Unknown step'}</div>
                                                                    {step.narrative?.context && (
                                                                        <div style={{
                                                                            fontSize: '0.75rem',
                                                                            color: '#888',
                                                                            marginTop: '0.25rem',
                                                                            fontStyle: 'italic'
                                                                        }}>
                                                                            {step.narrative.context}
                                                                        </div>
                                                                    )}
                                                                    {stepLocation && targetLocationId && (
                                                                        <div style={{
                                                                            fontSize: '0.75rem',
                                                                            color: state.currentLocationId === targetLocationId ? '#4ade80' : '#fbbf24',
                                                                            marginTop: '0.25rem'
                                                                        }}>
                                                                            📍 {stepLocation.name}
                                                                            {state.currentLocationId !== targetLocationId && ' (Travel required)'}
                                                                        </div>
                                                                    )}
                                                                    {subQuest && (
                                                                        <div style={{
                                                                            fontSize: '0.75rem',
                                                                            color: '#9333ea',
                                                                            marginTop: '0.25rem'
                                                                        }}>
                                                                            Sub-quest: {subQuest.progress.current}/{subQuest.progress.required}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Show if this is a sub-quest */}
                                    {q.templateId.startsWith('dynamic_') && (
                                        <div style={{
                                            marginTop: '0.5rem',
                                            padding: '0.5rem',
                                            background: 'rgba(147, 51, 234, 0.1)',
                                            border: '1px solid #9333ea',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            color: '#9333ea'
                                        }}>
                                            ⚔️ Part of an Adventure Quest
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => isAdventure ? handleStartAdventure(q.id) : handleStartQuestActivity(q.id)}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: isQuestActivity ? '#444' : 'var(--color-primary)',
                                                border: isQuestActivity ? '1px solid #666' : 'none',
                                                borderRadius: '4px',
                                                color: isQuestActivity ? '#888' : '#fff',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            {isQuestActivity ? 'Refocus' : 'Start Quest'}
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
