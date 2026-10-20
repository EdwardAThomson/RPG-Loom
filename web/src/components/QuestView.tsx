import { useState } from 'react';
import { EngineState, PlayerCommand, QuestTemplateDef } from '@rpg-loom/shared';
import { getAvailableQuests, parseDynamicTemplateId } from '@rpg-loom/engine';
import { ArrowRight, Check, Lock, MapPin, Sparkles, Star } from 'lucide-react';
import { enhanceQuest } from '../services/questEnhancement';
import { generateAdventureQuest } from '../services/adventureQuestGeneration';
import '../styles/quests.css';

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

    // Filter out sub-quests that belong to inactive adventures.
    // Include both in-progress and ready-to-turn-in quests so the player
    // sees them in the same list (the latter just renders differently).
    const activeQuests = state.quests.filter(q => {
        if (q.status !== 'active' && q.status !== 'ready_to_turn_in') return false;

        // If this is a sub-quest (one of the per-step dynamic kinds —
        // parseDynamicTemplateId rejects the 'dynamic_adventure' parent
        // marker), only show it if:
        // 1. Its parent adventure step is active (so user can start it), OR
        // 2. The sub-quest itself is the active quest activity (so it stays visible while working)
        if (parseDynamicTemplateId(q.templateId)) {
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

    // Get available quests using new filtering logic. Pass `Date.now()`
    // from the UI rather than letting the engine read the wall clock.
    const availableQuests = content ? getAvailableQuests(state, content, Date.now()) : [];

    // Sort by difficulty
    availableQuests.sort((a, b) => a.difficulty - b.difficulty);

    const handleAcceptQuest = (templateId: string) => {
        dispatch({
            type: 'ACCEPT_QUEST',
            templateId,
            atMs: Date.now()
        });
    };

    const handleTurnInQuest = (questId: string) => {
        dispatch({
            type: 'TURN_IN_QUEST',
            questId,
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

    const renderDifficulty = (difficulty: number) => (
        <span className="stars" aria-label={`Difficulty ${difficulty}`} title={`Difficulty ${difficulty}`}>
            {Array.from({ length: difficulty }, (_, i) => (
                <Star key={i} size={12} fill="currentColor" />
            ))}
        </span>
    );

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
        if (rewards.gold) parts.push(`${rewards.gold} g`);
        if (rewards.items?.length) {
            rewards.items.forEach((item: any) => {
                const itemName = content?.itemsById?.[item.itemId]?.name || item.itemId;
                parts.push(`${item.qty}x ${itemName}`);
            });
        }
        return parts.join(', ');
    };

    // Get current location name
    const currentLocation = content?.locationsById?.[state.currentLocationId];
    const locationName = currentLocation?.name || state.currentLocationId;

    return (
        <div className="stack">
            {/* Quest Board - Available Quests */}
            <section className="card">
                <h2>Quest board</h2>
                <p className="small muted">
                    Current location: <span className="quest-title">{locationName}</span>
                </p>
                {availableQuests.length === 0 ? (
                    <p className="empty">
                        No quests available at this location. Try exploring other areas.
                    </p>
                ) : (
                    <div className="list">
                        {availableQuests.map(tmpl => (
                            <div key={tmpl.id} className="callout quest-card">
                                <div className="quest-head">
                                    <span className="quest-title">{tmpl.name || tmpl.id}</span>
                                    {renderDifficulty(tmpl.difficulty)}
                                </div>

                                <p className="prose">
                                    {tmpl.description || 'No description available.'}
                                </p>

                                {tmpl.questGiverNpcId && content?.npcsById?.[tmpl.questGiverNpcId] && (() => {
                                    const giver = content.npcsById[tmpl.questGiverNpcId];
                                    const giverLoc = content.locationsById?.[giver.locationId];
                                    return (
                                        <div className="small muted">
                                            From {giver.name}{giverLoc ? ` · ${giverLoc.name}` : ''}
                                        </div>
                                    );
                                })()}

                                <div className="small muted">
                                    Objective: {getObjectiveText(tmpl)}
                                </div>

                                <div className="small">
                                    <span className="muted">Rewards: </span>
                                    <span className="gold">{formatRewards(tmpl.rewardPack)}</span>
                                </div>

                                <div className="btn-row">
                                    <button
                                        type="button"
                                        className="primary btn-sm"
                                        onClick={() => handleAcceptQuest(tmpl.id)}
                                    >
                                        Accept quest
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Generate AI Adventure Button */}
                <div className="quest-divider">
                    <button
                        type="button"
                        className="btn-ai btn-block"
                        onClick={handleGenerateAdventure}
                        disabled={generatingAdventure}
                    >
                        <Sparkles size={14} />
                        {generatingAdventure ? 'Generating adventure…' : 'Generate AI adventure'}
                    </button>
                    {adventureError && (
                        <div className="callout callout-warn section">
                            {adventureError}
                        </div>
                    )}
                </div>
            </section>

            {/* Active Quests */}
            <section className="card">
                <h2>Active quests</h2>
                {enhanceError && (
                    <div className="callout callout-warn">
                        {enhanceError}
                    </div>
                )}
                {activeQuests.length === 0 ? (
                    <p className="empty">
                        No active quests. Visit the quest board above to accept one.
                    </p>
                ) : (
                    <div className="list">
                        {activeQuests.map(q => {
                            // Parse once; non-null = adventure sub-quest of one of
                            // the per-step kinds. dynamic_adventure parent doesn't
                            // parse — it's checked separately via isAdventure.
                            const parsed = parseDynamicTemplateId(q.templateId);
                            const tmpl = parsed
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
                                            const subParsed = parseDynamicTemplateId(subQuest.templateId);
                                            // For gather quests, check if we're in a gathering activity at the quest location
                                            if (subParsed?.kind === 'gather' &&
                                                (state.activity.params.type === 'mine' ||
                                                    state.activity.params.type === 'woodcut' ||
                                                    state.activity.params.type === 'forage') &&
                                                'locationId' in state.activity.params &&
                                                state.activity.params.locationId === subQuest.locationId) {
                                                return true;
                                            }
                                            // For explore quests, check if we're exploring at the quest location
                                            if (subParsed?.kind === 'explore' &&
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

                                // For sub-quests, also check if the player is in the
                                // matching ambient activity (e.g. mining at the quest
                                // location counts as "working on" a gather sub-quest).
                                if (!isQuestActivity && parsed) {
                                    switch (parsed.kind) {
                                        case 'gather':
                                            isQuestActivity = (state.activity.params.type === 'mine' ||
                                                state.activity.params.type === 'woodcut' ||
                                                state.activity.params.type === 'forage') &&
                                                'locationId' in state.activity.params &&
                                                state.activity.params.locationId === q.locationId;
                                            break;
                                        case 'explore':
                                            isQuestActivity = state.activity.params.type === 'explore' &&
                                                'locationId' in state.activity.params &&
                                                state.activity.params.locationId === q.locationId;
                                            break;
                                        case 'kill':
                                            isQuestActivity = state.activity.params.type === 'hunt' &&
                                                'locationId' in state.activity.params &&
                                                state.activity.params.locationId === q.locationId;
                                            break;
                                        case 'craft':
                                            isQuestActivity = state.activity.params.type === 'craft' &&
                                                'recipeId' in state.activity.params &&
                                                state.activity.params.recipeId === parsed.targetId;
                                            break;
                                        case 'travel':
                                        case 'deliver':
                                            // No ambient-activity equivalent; player has
                                            // to explicitly switch to a 'quest' activity
                                            // or travel/deliver via TRAVEL command.
                                            break;
                                    }
                                }
                            }

                            const pct = Math.min(100, (q.progress.current / q.progress.required) * 100);

                            return (
                                <div
                                    key={q.id}
                                    className={`callout quest-card${isQuestActivity ? ' is-active' : ''}`}
                                >
                                    <div className="quest-head">
                                        <span className="quest-title">
                                            {q.aiNarrative?.title || questName}
                                            {q.aiNarrative && (
                                                <span className="chip chip-ai">
                                                    <Sparkles size={10} /> AI
                                                </span>
                                            )}
                                            {isQuestActivity && q.status === 'active' && (
                                                <span className="chip">Active</span>
                                            )}
                                            {q.status === 'ready_to_turn_in' && (
                                                <span className="chip chip-ok">Ready to hand in</span>
                                            )}
                                        </span>
                                    </div>

                                    {q.aiNarrative?.description && (
                                        <p className="prose">
                                            {q.aiNarrative.description}
                                        </p>
                                    )}

                                    {q.npcId && content.npcsById?.[q.npcId] && (() => {
                                        const npc = content.npcsById[q.npcId];
                                        const npcLoc = content.locationsById[npc.locationId];
                                        return (
                                            <div className="small muted">
                                                Given by {npc.name}{npcLoc ? ` · ${npcLoc.name}` : ''}
                                            </div>
                                        );
                                    })()}

                                    {tmpl && (
                                        <div className="small muted">
                                            {getObjectiveText(tmpl)}
                                            {tmpl.objectiveType !== 'craft' && (() => {
                                                const locName = content?.locationsById?.[q.locationId]?.name;
                                                return locName ? ` · in ${locName}` : '';
                                            })()}
                                        </div>
                                    )}

                                    <div className="progress-row">
                                        <span className="bar bar-quest"><i style={{ width: `${pct}%` }} /></span>
                                        <span>{q.progress.current} / {q.progress.required}</span>
                                    </div>

                                    {/* Adventure Steps Display */}
                                    {q.adventureSteps && q.adventureSteps.length > 0 && (() => {
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

                                        return (
                                            <div className="section">
                                                <div className="hud-label ai">Adventure progress</div>
                                                {stepsToDisplay.length === 0 ? (
                                                    <div className="callout callout-warn">
                                                        Quest data is incomplete. Try abandoning and generating a new adventure.
                                                    </div>
                                                ) : (
                                                    <ul className="steps">
                                                        {stepsToDisplay.map((step: any) => {
                                                            const StatusIcon = step.status === 'completed' ? Check :
                                                                step.status === 'active' ? ArrowRight : Lock;
                                                            const statusClass = step.status === 'completed' ? 'ok' :
                                                                step.status === 'active' ? 'gold' : 'faint';

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

                                                            const isHere = state.currentLocationId === targetLocationId;

                                                            return (
                                                                <li key={step.stepNumber} className={`step ${statusClass}`}>
                                                                    <StatusIcon size={14} />
                                                                    <div className="step-body">
                                                                        <div className="step-text">{step.narrative?.description || 'Unknown step'}</div>
                                                                        {step.narrative?.context && (
                                                                            <div className="small faint">
                                                                                {step.narrative.context}
                                                                            </div>
                                                                        )}
                                                                        {stepLocation && targetLocationId && (
                                                                            <div className={`small step-loc ${isHere ? 'ok' : 'gold'}`}>
                                                                                <MapPin size={12} />
                                                                                {stepLocation.name}
                                                                                {!isHere && ' (travel required)'}
                                                                            </div>
                                                                        )}
                                                                        {subQuest && (
                                                                            <div className="small ai">
                                                                                Sub-quest: {subQuest.progress.current}/{subQuest.progress.required}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Show if this is an adventure sub-quest. The
                                        'dynamic_adventure' parent isn't "part of an
                                        adventure" — it IS the adventure — so
                                        parseDynamicTemplateId (which rejects the
                                        parent) is the right test. */}
                                    {parsed && (
                                        <div className="small ai">
                                            Part of an adventure quest
                                        </div>
                                    )}

                                    <div className="btn-row">
                                        {q.status === 'ready_to_turn_in' ? (() => {
                                            // Player has to be at the giver's location to hand in.
                                            // Engine enforces this too, but disabling the button
                                            // up-front avoids generating a useless ERROR event.
                                            const giver = q.npcId ? content.npcsById?.[q.npcId] : null;
                                            const giverLoc = giver ? content.locationsById?.[giver.locationId] : null;
                                            const canHandIn = !!giver && state.currentLocationId === giver.locationId;
                                            return (
                                                <button
                                                    type="button"
                                                    className="primary btn-sm"
                                                    onClick={() => handleTurnInQuest(q.id)}
                                                    disabled={!canHandIn}
                                                    title={canHandIn ? undefined : (giverLoc ? `Travel to ${giverLoc.name} to hand this in.` : 'No giver to hand in to.')}
                                                >
                                                    {giver ? `Hand in to ${giver.name}` : 'Hand in'}
                                                </button>
                                            );
                                        })() : (() => {
                                            // Kill and gather quests only progress at their
                                            // location, so offer the trip instead of a start
                                            // button that would spin with no effect.
                                            const needsTravel = !!tmpl
                                                && (tmpl.objectiveType === 'kill' || tmpl.objectiveType === 'gather')
                                                && q.locationId !== state.currentLocationId;
                                            const questLoc = content?.locationsById?.[q.locationId];
                                            if (needsTravel) {
                                                return (
                                                    <button
                                                        type="button"
                                                        className="primary btn-sm"
                                                        onClick={() => dispatch({ type: 'TRAVEL', locationId: q.locationId, atMs: Date.now() })}
                                                    >
                                                        <MapPin size={12} aria-hidden /> Travel to {questLoc?.name ?? q.locationId}
                                                    </button>
                                                );
                                            }
                                            return (
                                                <button
                                                    type="button"
                                                    className={isQuestActivity ? 'btn-sm' : 'primary btn-sm'}
                                                    onClick={() => isAdventure ? handleStartAdventure(q.id) : handleStartQuestActivity(q.id)}
                                                >
                                                    {isQuestActivity ? 'Refocus' : 'Start quest'}
                                                </button>
                                            );
                                        })()}
                                        <button
                                            type="button"
                                            className="btn-sm"
                                            onClick={() => handleAbandonQuest(q.id)}
                                        >
                                            Abandon
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-ai btn-sm"
                                            onClick={() => handleEnhanceQuest(q.id)}
                                            disabled={enhancingQuest === q.id || !!q.aiNarrative}
                                        >
                                            <Sparkles size={12} />
                                            {enhancingQuest === q.id ? 'Enhancing…' : q.aiNarrative ? 'Enhanced' : 'Enhance with AI'}
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
                <p className="small muted">
                    {completedQuests.length} quest{completedQuests.length !== 1 ? 's' : ''} completed.
                </p>
            </section>
        </div>
    );
}
