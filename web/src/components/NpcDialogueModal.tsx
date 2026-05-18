import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentIndex, EngineState, GameEvent, NpcDef, NpcStateEntry, PlayerCommand, QuestTemplateDef } from '@rpg-loom/shared';
import { getQuestsOfferedByNpc } from '@rpg-loom/engine';
import { generateNpcDialogue } from '../services/npcDialogue';
import { isGatewayAvailable, onGatewayStatusChange } from '../services/gateway';

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
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.85)', zIndex: 2100,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onClick={onClose}
        >
            <div
                className="card"
                style={{
                    maxWidth: 560, width: '92%', maxHeight: '90vh', overflowY: 'auto',
                    border: '1px solid #666'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                    <h2 style={{ margin: 0 }}>{npc.name}</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer' }}
                        aria-label="Close"
                    >×</button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    <span style={badgeStyle}>{npc.role.replace('_', ' ')}</span>
                    {location && <span>at {location.name}</span>}
                </div>

                <AffinityBar affinity={affinity} haveMet={haveMet} />

                {prompts.topic && (
                    <Section title="About">
                        <p style={paragraphStyle}>{prompts.topic}</p>
                    </Section>
                )}

                {prompts.greeting && (
                    <Section title={haveMet ? 'They say' : 'On first meeting'}>
                        <p style={dialogueStyle}>“{prompts.greeting}”</p>
                    </Section>
                )}

                {prompts.questIntro && (
                    <Section title="A favor to ask">
                        <p style={dialogueStyle}>“{prompts.questIntro}”</p>
                    </Section>
                )}

                {readyToHandIn.length > 0 && (
                    <Section title={readyToHandIn.length === 1 ? 'Ready to hand in' : 'Ready to hand in'}>
                        {readyToHandIn.map(q => {
                            const tmpl = content.questTemplatesById[q.templateId];
                            const reward = tmpl ? describeReward(tmpl.rewardPack) : '';
                            return (
                                <div key={q.id} style={{ ...questRowStyle, border: '1px solid #8fbc8f' }}>
                                    <div style={{ color: '#ddd', fontSize: '0.9rem' }}>
                                        {tmpl?.name ?? q.templateId}
                                    </div>
                                    <div style={{ color: '#8fbc8f', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                        ready · {q.progress.current}/{q.progress.required}
                                        {reward ? ` · ${reward}` : ''}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => turnInQuest(q.id)}
                                        disabled={!isHere}
                                        title={isHere ? 'Hand this quest in for rewards.' : `Travel to ${location?.name ?? npc.locationId}.`}
                                        style={{
                                            marginTop: '0.4rem',
                                            padding: '0.35rem 0.7rem',
                                            background: '#2a2a2a',
                                            color: '#fff',
                                            border: '1px solid #8fbc8f',
                                            borderRadius: 3,
                                            cursor: isHere ? 'pointer' : 'not-allowed',
                                            opacity: isHere ? 1 : 0.5,
                                            fontSize: '0.8rem'
                                        }}
                                    >
                                        Hand in
                                    </button>
                                </div>
                            );
                        })}
                    </Section>
                )}

                {inFlight.length > 0 && (
                    <Section title={inFlight.length === 1 ? 'Their errand' : 'Their errands'}>
                        {inFlight.map(q => {
                            const tmpl = content.questTemplatesById[q.templateId];
                            // q.locationId is the resolved single location
                            // picked at accept time — clearer than pool.
                            const locName = tmpl?.objectiveType === 'craft'
                                ? null
                                : content.locationsById[q.locationId]?.name ?? null;
                            return (
                                <div key={q.id} style={questRowStyle}>
                                    <div style={{ color: '#ddd', fontSize: '0.9rem' }}>
                                        {tmpl?.name ?? q.templateId}
                                    </div>
                                    <div style={{ color: '#888', fontSize: '0.75rem' }}>
                                        in progress · {q.progress.current}/{q.progress.required}
                                        {locName ? ` · in ${locName}` : ''}
                                    </div>
                                </div>
                            );
                        })}
                    </Section>
                )}

                {offered.length > 0 && (
                    <Section title={offered.length === 1 ? 'They have work' : 'Work they offer'}>
                        {offered.map(tmpl => (
                            <QuestOfferRow
                                key={tmpl.id}
                                tmpl={tmpl}
                                content={content}
                                canAccept={isHere}
                                onAccept={() => acceptQuest(tmpl.id)}
                            />
                        ))}
                    </Section>
                )}

                {flavor?.description && (
                    <Section title="Bearing">
                        <p style={paragraphStyle}>{flavor.description}</p>
                    </Section>
                )}

                {flavor?.dialogueLines?.length ? (
                    <Section title="Heard before">
                        {flavor.dialogueLines.map((line, i) => (
                            <p key={i} style={dialogueStyle}>{line}</p>
                        ))}
                    </Section>
                ) : null}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                        onClick={greet}
                        disabled={!isHere}
                        title={isHere ? undefined : `Travel to ${location?.name ?? npc.locationId} to speak with them.`}
                        style={{
                            ...primaryBtn,
                            opacity: isHere ? 1 : 0.5,
                            cursor: isHere ? 'pointer' : 'not-allowed'
                        }}
                    >
                        {haveMet ? 'Talk again' : 'Greet'}
                    </button>
                    <button
                        onClick={onClose}
                        style={secondaryBtn}
                    >
                        Leave
                    </button>
                </div>

                {!isHere && (
                    <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
                        You'd need to travel to {location?.name ?? npc.locationId} to speak with them.
                    </p>
                )}

                {isHere && justGreeted && (
                    <p style={{ color: '#8fbc8f', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
                        Affinity now {(entry?.affinity ?? 1)}.
                    </p>
                )}
            </div>
        </div>
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
        <div style={questRowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <div style={{ color: '#ddd', fontSize: '0.9rem' }}>{tmpl.name ?? tmpl.id}</div>
                <div style={{ color: '#ffa500', fontSize: '0.75rem' }}>{'★'.repeat(tmpl.difficulty)}</div>
            </div>
            {tmpl.description && (
                <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.15rem' }}>{tmpl.description}</div>
            )}
            <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {objective}
                {location ? ` · ${location}` : ''}
                {reward ? ` · ${reward}` : ''}
            </div>
            <button
                type="button"
                onClick={onAccept}
                disabled={!canAccept}
                title={canAccept ? undefined : 'Travel here first.'}
                style={{
                    marginTop: '0.4rem',
                    padding: '0.35rem 0.7rem',
                    background: '#2a2a2a',
                    color: '#fff',
                    border: '1px solid #8fbc8f',
                    borderRadius: 3,
                    cursor: canAccept ? 'pointer' : 'not-allowed',
                    opacity: canAccept ? 1 : 0.5,
                    fontSize: '0.8rem'
                }}
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
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
                <span>{haveMet ? 'Affinity' : 'Stranger'}</span>
                <span>{pct} / 100</span>
            </div>
            <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#8fbc8f', transition: 'width 0.3s ease' }} />
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{title}</div>
            {children}
        </div>
    );
}

const questRowStyle: React.CSSProperties = {
    background: '#181818',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    padding: '0.5rem 0.6rem',
    marginBottom: '0.4rem'
};

const paragraphStyle: React.CSSProperties = {
    margin: 0,
    color: '#bbb',
    fontSize: '0.9rem',
    lineHeight: 1.5
};

const dialogueStyle: React.CSSProperties = {
    margin: '0 0 0.25rem 0',
    color: '#ddd',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    fontStyle: 'italic'
};

const badgeStyle: React.CSSProperties = {
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 3,
    padding: '1px 6px',
    color: '#aaa',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
};

const primaryBtn: React.CSSProperties = {
    flex: 1,
    padding: '0.6rem',
    background: '#2a2a2a',
    color: '#fff',
    border: '1px solid #8fbc8f',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.95rem'
};

const secondaryBtn: React.CSSProperties = {
    flex: 1,
    padding: '0.6rem',
    background: 'transparent',
    color: '#aaa',
    border: '1px solid #444',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.95rem'
};
