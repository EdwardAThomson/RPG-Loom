import { useMemo, useState } from 'react';
import type { ContentIndex, EngineState, NpcDef, PlayerCommand } from '@rpg-loom/shared';
import { NpcDialogueModal } from './NpcDialogueModal';

interface Props {
    state: EngineState;
    content: ContentIndex;
    dispatch: (cmd: PlayerCommand) => void;
}

/**
 * Phase 3b: NPC roster + per-NPC dialogue modal.
 *
 * Two sections — "here at <current location>" and "elsewhere" — so the
 * player both sees who they can talk to right now and remembers who
 * they've met in other places. Click a row → opens the modal.
 */
export function NpcsView({ state, content, dispatch }: Props) {
    const [activeNpc, setActiveNpc] = useState<NpcDef | null>(null);

    const { hereNpcs, elsewhereNpcs } = useMemo(() => {
        const all = Object.values(content.npcsById ?? {});
        const here: NpcDef[] = [];
        const elsewhere: NpcDef[] = [];
        for (const npc of all) {
            if (npc.locationId === state.currentLocationId) {
                here.push(npc);
            } else {
                elsewhere.push(npc);
            }
        }
        // Sort: known-first within each section, then by name.
        const knowsThem = (id: string) => state.npcState?.[id]?.firstMetAtMs !== undefined;
        here.sort((a, b) => Number(knowsThem(b.id)) - Number(knowsThem(a.id)) || a.name.localeCompare(b.name));
        elsewhere.sort((a, b) => Number(knowsThem(b.id)) - Number(knowsThem(a.id)) || a.name.localeCompare(b.name));
        return { hereNpcs: here, elsewhereNpcs: elsewhere };
    }, [content.npcsById, state.currentLocationId, state.npcState]);

    const currentLocationName = content.locationsById[state.currentLocationId]?.name ?? state.currentLocationId;

    return (
        <div className="card">
            <h2 style={{ marginTop: 0 }}>Folk</h2>

            <Section title={`Here at ${currentLocationName}`}>
                {hereNpcs.length === 0 ? (
                    <p style={emptyStyle}>No one to speak with here.</p>
                ) : (
                    <div style={listStyle}>
                        {hereNpcs.map(npc => (
                            <NpcRow
                                key={npc.id}
                                npc={npc}
                                state={state}
                                content={content}
                                onClick={() => setActiveNpc(npc)}
                                showLocation={false}
                            />
                        ))}
                    </div>
                )}
            </Section>

            {elsewhereNpcs.length > 0 && (
                <Section title="Met elsewhere">
                    <div style={listStyle}>
                        {elsewhereNpcs.map(npc => (
                            <NpcRow
                                key={npc.id}
                                npc={npc}
                                state={state}
                                content={content}
                                onClick={() => setActiveNpc(npc)}
                                showLocation={true}
                            />
                        ))}
                    </div>
                </Section>
            )}

            {activeNpc && (
                <NpcDialogueModal
                    npc={activeNpc}
                    state={state}
                    content={content}
                    dispatch={dispatch}
                    onClose={() => setActiveNpc(null)}
                />
            )}
        </div>
    );
}

function NpcRow({
    npc, state, content, onClick, showLocation
}: {
    npc: NpcDef;
    state: EngineState;
    content: ContentIndex;
    onClick: () => void;
    showLocation: boolean;
}) {
    const entry = state.npcState?.[npc.id];
    const known = entry?.firstMetAtMs !== undefined;
    const affinity = entry?.affinity ?? 0;
    const lastSeen = entry?.lastInteractionMs
        ? formatAgo(Date.now() - entry.lastInteractionMs)
        : null;
    const location = content.locationsById[npc.locationId];

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: '#181818',
                border: '1px solid #2a2a2a',
                borderRadius: 4,
                padding: '0.6rem 0.75rem',
                color: 'inherit',
                cursor: 'pointer',
                font: 'inherit'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ color: known ? '#ddd' : '#999', fontWeight: 500 }}>
                        {known ? npc.name : `??? (${roleLabel(npc.role)})`}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>
                        {known
                            ? `${roleLabel(npc.role)}${showLocation && location ? ` · ${location.name}` : ''}${lastSeen ? ` · seen ${lastSeen}` : ''}`
                            : (showLocation && location ? location.name : 'Not yet met')}
                    </span>
                </div>
                {known && (
                    <div style={{ minWidth: 80, textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: '#888' }}>affinity</div>
                        <div style={{ fontSize: '0.85rem', color: '#8fbc8f' }}>{affinity}</div>
                    </div>
                )}
            </div>
        </button>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem 0' }}>
                {title}
            </h3>
            {children}
        </div>
    );
}

function roleLabel(role: string): string {
    return role.replace(/_/g, ' ');
}

function formatAgo(ms: number): string {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}

const listStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem'
};

const emptyStyle: React.CSSProperties = {
    color: '#888',
    fontStyle: 'italic',
    margin: 0
};
