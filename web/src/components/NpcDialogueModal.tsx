import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentIndex, EngineState, GameEvent, NpcDef, NpcStateEntry, PlayerCommand, QuestTemplateDef } from '@rpg-loom/shared';
import { getQuestsOfferedByNpc } from '@rpg-loom/engine';
import { Star } from 'lucide-react';
import { generateNpcDialogue } from '../services/npcDialogue';
import { isGatewayAvailable, onGatewayStatusChange } from '../services/gateway';
import { Modal } from './Modal';

interface Props {
    npc: NpcDef;
    state: EngineState;
    content: ContentIndex;
    dispatch: (cmd: PlayerCommand) => void;
    onClose: () => void;
    /** Optional: recent events to feed the AI. Defaults to []. */
    recentEvents?: GameEvent[];
}

/**
 * One-NPC conversation modal. Phase 3b shows authored prompts; Phase 3c
 * will layer AI-generated dialogue on top via `generatedFlavor`.
 *
 * Opening the modal is a read-only browse. "Greet" is the explicit
 * affinity-bumping action so players don't accidentally grind affinity
 * by toggling the tab.
 */
export function NpcDialogueModal({ npc, state, content, dispatch, onClose, recentEvents = [] }: Props) {
    const entry: NpcStateEntry | undefined = state.npcState?.[npc.id];
    const [justGreeted, setJustGreeted] = useState(false);
    const [gatewayUp, setGatewayUp] = useState<boolean | null>(isGatewayAvailable());
    // Prevent re-entry while a fetch is in flight without exposing a
    // visible loading state — the AI work is meant to be invisible.
    const generationInFlightRef = useRef(false);

    useEffect(() => onGatewayStatusChange(setGatewayUp), []);

    const greet = () => {
        dispatch({ type: 'TALK_TO_NPC', npcId: npc.id, atMs: Date.now() });
        setJustGreeted(true);
        // Fire-and-forget AI flavor generation on the first time the
        // player actually talks to them. No visible "generate" button —
        // the NPCs should feel like they have always existed; their
        // voice is something the player discovers by greeting them, not
        // something the player commissions.
        //
        // - Skip if we already have their flavor cached.
        // - Skip silently if the gateway is unreachable. The authored
        //   greeting / topic / questIntro lines still show; the player
        //   never sees an error about AI generation.
        // - Skip if we're not at their location (engine would reject
        //   the TALK_TO_NPC anyway, no point spending the tokens).
        if (entry?.generatedFlavor) return;
        if (!isHere || gatewayUp === false) return;
        if (generationInFlightRef.current) return;

        generationInFlightRef.current = true;
        generateNpcDialogue(npc, state, content, recentEvents)
            .then(flavor => {
                dispatch({
                    type: 'SET_NPC_FLAVOR',
                    npcId: npc.id,
                    flavor,
                    atMs: Date.now()
                });
            })
            .catch(e => {
                // Silent: authored prompts still render. Don't break
                // immersion with a "gateway returned 500" toast.
                console.warn('[npc] dialogue generation failed', e);
            })
            .finally(() => {
                generationInFlightRef.current = false;
            });
    };

    const location = content.locationsById[npc.locationId];
    const prompts = npc.prompts ?? {};
    const flavor = entry?.generatedFlavor;
    const affinity = entry?.affinity ?? 0;
    const haveMet = entry?.firstMetAtMs !== undefined;
    // Talking requires being at the NPC's location. Engine enforces this
    // too — this is just the UI mirror so the button reads "Travel to X"
    // instead of producing a silent error.
    const isHere = state.currentLocationId === npc.locationId;

    // Quests this NPC currently has on offer (filtered through the same
    // availability gate the Quest Board uses) plus active quests they've
    // already handed out that aren't done yet.
    const { offered, inFlight, readyToHandIn } = useMemo(() => {
        const offered = getQuestsOfferedByNpc(state, content, npc.id, Date.now());
        const mine = state.quests.filter(
            q => q.npcId === npc.id && !q.templateId.startsWith('dynamic_')
        );
        const inFlight = mine.filter(q => q.status === 'active');
        const readyToHandIn = mine.filter(q => q.status === 'ready_to_turn_in');
        return { offered, inFlight, readyToHandIn };
    }, [state, content, npc.id]);

    const acceptQuest = (templateId: string) => {
        // Pass an explicit npcId so attribution survives even if the
        // template's questGiverNpcId is ever cleared.
        dispatch({ type: 'ACCEPT_QUEST', templateId, npcId: npc.id, atMs: Date.now() });
    };

    const turnInQuest = (questId: string) => {
        dispatch({ type: 'TURN_IN_QUEST', questId, atMs: Date.now() });
    };

    return (
        <Modal
            title={npc.name}
            subtitle={(
                <>
                    <span className="chip chip-muted">{npc.role.replace('_', ' ')}</span>
                    {location && <> · at {location.name}</>}
                </>
            )}
            onClose={onClose}
            zIndex={2100}
        >
            <AffinityBar affinity={affinity} haveMet={haveMet} />

            {prompts.topic && (
                <Section title="About">
                    <p className="prose">{prompts.topic}</p>
                </Section>
            )}

            {prompts.greeting && (
                <Section title={haveMet ? 'They say' : 'On first meeting'}>
                    <p className="quote">“{prompts.greeting}”</p>
                </Section>
            )}

            {prompts.questIntro && (
                <Section title="A favor to ask">
                    <p className="quote">“{prompts.questIntro}”</p>
                </Section>
            )}

            {readyToHandIn.length > 0 && (
                <Section title="Ready to hand in">
                    <div className="list">
                        {readyToHandIn.map(q => {
                            const tmpl = content.questTemplatesById[q.templateId];
                            const reward = tmpl ? describeReward(tmpl.rewardPack) : '';
                            return (
                                <div key={q.id} className="row-card is-active">
                                    <div className="grow">
                                        <div className="list-title">{tmpl?.name ?? q.templateId}</div>
                                        <div className="list-sub ok">
                                            Ready · {q.progress.current}/{q.progress.required}
                                            {reward ? ` · ${reward}` : ''}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="primary btn-sm"
                                        onClick={() => turnInQuest(q.id)}
                                        disabled={!isHere}
                                        title={isHere ? 'Hand this quest in for rewards.' : `Travel to ${location?.name ?? npc.locationId}.`}
                                    >
                                        Hand in
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {inFlight.length > 0 && (
                <Section title={inFlight.length === 1 ? 'Their errand' : 'Their errands'}>
                    <div className="list">
                        {inFlight.map(q => {
                            const tmpl = content.questTemplatesById[q.templateId];
                            // q.locationId is the resolved single location
                            // picked at accept time — clearer than pool.
                            const locName = tmpl?.objectiveType === 'craft'
                                ? null
                                : content.locationsById[q.locationId]?.name ?? null;
                            return (
                                <div key={q.id} className="row-card">
                                    <div className="grow">
                                        <div className="list-title">{tmpl?.name ?? q.templateId}</div>
                                        <div className="list-sub">
                                            In progress · {q.progress.current}/{q.progress.required}
                                            {locName ? ` · in ${locName}` : ''}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {offered.length > 0 && (
                <Section title={offered.length === 1 ? 'They have work' : 'Work they offer'}>
                    <div className="list">
                        {offered.map(tmpl => (
                            <QuestOfferRow
                                key={tmpl.id}
                                tmpl={tmpl}
                                content={content}
                                canAccept={isHere}
                                onAccept={() => acceptQuest(tmpl.id)}
                            />
                        ))}
                    </div>
                </Section>
            )}

            {flavor?.description && (
                <Section title="Bearing">
                    <p className="prose">{flavor.description}</p>
                </Section>
            )}

            {flavor?.dialogueLines?.length ? (
                <Section title="Heard before">
                    {flavor.dialogueLines.map((line, i) => (
                        <p key={i} className="quote">{line}</p>
                    ))}
                </Section>
            ) : null}

            <div className="btn-row section">
                <button
                    type="button"
                    className="primary"
                    onClick={greet}
                    disabled={!isHere}
                    title={isHere ? undefined : `Travel to ${location?.name ?? npc.locationId} to speak with them.`}
                >
                    {haveMet ? 'Talk again' : 'Greet'}
                </button>
                <button type="button" onClick={onClose}>
                    Leave
                </button>
            </div>

            {!isHere && (
                <p className="small muted">
                    You'd need to travel to {location?.name ?? npc.locationId} to speak with them.
                </p>
            )}

            {isHere && justGreeted && (
                <p className="small muted">
                    Affinity now {(entry?.affinity ?? 1)}.
                </p>
            )}
        </Modal>
    );
}

function QuestOfferRow({
    tmpl,
    content,
    canAccept,
    onAccept
}: {
    tmpl: QuestTemplateDef;
    content: ContentIndex;
    canAccept: boolean;
    onAccept: () => void;
}) {
    const objective = describeObjective(tmpl, content);
    const location = describeLocation(tmpl, content);
    const reward = describeReward(tmpl.rewardPack);
    return (
        <div className="row-card">
            <div className="grow">
                <div className="list-title">
                    {tmpl.name ?? tmpl.id}
                    {' '}
                    <span className="stars" aria-label={`Difficulty ${tmpl.difficulty}`} title={`Difficulty ${tmpl.difficulty}`}>
                        {Array.from({ length: tmpl.difficulty }, (_, i) => (
                            <Star key={i} size={12} fill="currentColor" />
                        ))}
                    </span>
                </div>
                {tmpl.description && (
                    <div className="list-sub">{tmpl.description}</div>
                )}
                <div className="list-sub">
                    {objective}
                    {location ? ` · ${location}` : ''}
                    {reward ? ` · ${reward}` : ''}
                </div>
            </div>
            <button
                type="button"
                className="primary btn-sm"
                onClick={onAccept}
                disabled={!canAccept}
                title={canAccept ? undefined : 'Travel here first.'}
            >
                Accept
            </button>
        </div>
    );
}

function describeObjective(tmpl: QuestTemplateDef, content: ContentIndex): string {
    const qty = tmpl.qtyMin === tmpl.qtyMax ? `${tmpl.qtyMin}` : `${tmpl.qtyMin}-${tmpl.qtyMax}`;
    switch (tmpl.objectiveType) {
        case 'kill': {
            const name = content.enemiesById[tmpl.targetEnemyId ?? '']?.name ?? tmpl.targetEnemyId ?? '?';
            return `Kill ${qty} ${name}`;
        }
        case 'gather': {
            const name = content.itemsById[tmpl.targetItemId ?? '']?.name ?? tmpl.targetItemId ?? '?';
            return `Gather ${qty} ${name}`;
        }
        case 'craft': {
            const name = content.recipesById[tmpl.targetRecipeId ?? '']?.name ?? tmpl.targetRecipeId ?? '?';
            return `Craft ${qty} ${name}`;
        }
        default:
            return tmpl.objectiveType;
    }
}

// Surface where the activity actually happens so the player knows where
// to go after accepting. Craft objectives are tied to workstations, not
// the quest's locationPool, so we skip them.
function describeLocation(tmpl: QuestTemplateDef, content: ContentIndex): string | null {
    if (tmpl.objectiveType === 'craft') return null;
    const pool = tmpl.locationPool ?? [];
    if (pool.length === 0) return null;
    const names = pool.map(id => content.locationsById[id]?.name ?? id);
    if (names.length === 1) return `in ${names[0]}`;
    return `in ${names.join(' or ')}`;
}

function describeReward(rp: QuestTemplateDef['rewardPack']): string {
    const parts: string[] = [];
    if (rp.xp) parts.push(`${rp.xp} XP`);
    if (rp.gold) parts.push(`${rp.gold} g`);
    return parts.join(', ');
}

function AffinityBar({ affinity, haveMet }: { affinity: number; haveMet: boolean }) {
    const pct = Math.max(0, Math.min(100, affinity));
    return (
        <div className="progress-row">
            <span>{haveMet ? 'Affinity' : 'Stranger'}</span>
            <span className="bar bar-affinity"><i style={{ width: `${pct}%` }} /></span>
            <span>{pct} / 100</span>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="section">
            <div className="hud-label">{title}</div>
            {children}
        </div>
    );
}
