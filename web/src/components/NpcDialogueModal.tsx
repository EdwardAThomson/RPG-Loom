import { useEffect, useState } from 'react';
import type { ContentIndex, EngineState, GameEvent, NpcDef, NpcStateEntry, PlayerCommand } from '@rpg-loom/shared';
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
    const [generating, setGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [gatewayUp, setGatewayUp] = useState<boolean | null>(isGatewayAvailable());

    useEffect(() => onGatewayStatusChange(setGatewayUp), []);

    const greet = () => {
        dispatch({ type: 'TALK_TO_NPC', npcId: npc.id, atMs: Date.now() });
        setJustGreeted(true);
    };

    const generate = async () => {
        setGenerationError(null);
        setGenerating(true);
        try {
            const flavor = await generateNpcDialogue(npc, state, content, recentEvents);
            dispatch({
                type: 'SET_NPC_FLAVOR',
                npcId: npc.id,
                flavor,
                atMs: Date.now()
            });
        } catch (e: any) {
            setGenerationError(e?.message ?? String(e));
        } finally {
            setGenerating(false);
        }
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

                {isHere && gatewayUp !== false && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <button
                            onClick={generate}
                            disabled={generating}
                            style={{
                                ...secondaryBtn,
                                width: '100%',
                                borderColor: '#9333ea',
                                color: generating ? '#888' : '#c084fc',
                                cursor: generating ? 'wait' : 'pointer'
                            }}
                            title={flavor
                                ? 'Re-roll their bearing and dialogue (text only — no audio).'
                                : 'Generate AI-written bearing and dialogue lines for this NPC (text only).'}
                        >
                            {generating
                                ? '✨ Imagining…'
                                : flavor
                                    ? '✨ Re-imagine them'
                                    : '✨ Imagine them'}
                        </button>
                        {generationError && (
                            <p style={{ color: '#d44', fontSize: '0.8rem', marginTop: '0.4rem', marginBottom: 0 }}>
                                {generationError}
                            </p>
                        )}
                    </div>
                )}

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
