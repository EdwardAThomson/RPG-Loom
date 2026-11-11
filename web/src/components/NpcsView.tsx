import { useMemo, useState } from 'react';
import type { ContentIndex, EngineState, GameEvent, NpcDef, PlayerCommand } from '@rpg-loom/shared';
import { NpcDialogueModal } from './NpcDialogueModal';
import { humanize } from '../ui/labels';
import { getAffinityTier } from '@rpg-loom/engine';

const TIER_LABEL = { stranger: 'Stranger', known: 'Known face', friend: 'Friend', trusted: 'Trusted' } as const;

interface Props {
    state: EngineState;
    content: ContentIndex;
    dispatch: (cmd: PlayerCommand) => void;
    events?: GameEvent[];
}

/**
 * NPC roster + per-NPC dialogue modal.
 *
 * Two sections, "here at <current location>" and "elsewhere", so the
 * player both sees who they can talk to right now and remembers who
 * they've met in other places. Click a row to open the modal.
 */
export function NpcsView({ state, content, dispatch, events }: Props) {
    const [activeNpc, setActiveNpc] = useState<NpcDef | null>(null);

    const { hereNpcs, elsewhereNpcs } = useMemo(() => {
        const all = Object.values(content.npcsById ?? {});
        const here: NpcDef[] = [];
        const elsewhere: NpcDef[] = [];
        for (const npc of all) {
            (npc.locationId === state.currentLocationId ? here : elsewhere).push(npc);
        }
        // Sort: known-first within each section, then by name.
        const knowsThem = (id: string) => state.npcState?.[id]?.firstMetAtMs !== undefined;
        const byKnown = (a: NpcDef, b: NpcDef) => Number(knowsThem(b.id)) - Number(knowsThem(a.id)) || a.name.localeCompare(b.name);
        here.sort(byKnown);
        elsewhere.sort(byKnown);
        return { hereNpcs: here, elsewhereNpcs: elsewhere };
    }, [content.npcsById, state.currentLocationId, state.npcState]);

    const currentLocationName = content.locationsById[state.currentLocationId]?.name ?? state.currentLocationId;

    return (
        <section className="card">
            <h2>Folk</h2>

            <div className="section">
                <div className="hud-label">Here at {currentLocationName}</div>
                {hereNpcs.length === 0 ? (
                    <p className="empty">No one to speak with here.</p>
                ) : (
                    <div className="list">
                        {hereNpcs.map(npc => (
                            <NpcRow key={npc.id} npc={npc} state={state} content={content} onClick={() => setActiveNpc(npc)} showLocation={false} />
                        ))}
                    </div>
                )}
            </div>

            {elsewhereNpcs.length > 0 && (
                <div className="section">
                    <div className="hud-label">Elsewhere</div>
                    <div className="list">
                        {elsewhereNpcs.map(npc => (
                            <NpcRow key={npc.id} npc={npc} state={state} content={content} onClick={() => setActiveNpc(npc)} showLocation />
                        ))}
                    </div>
                </div>
            )}

            {activeNpc && (
                <NpcDialogueModal
                    npc={activeNpc}
                    state={state}
                    content={content}
                    dispatch={dispatch}
                    onClose={() => setActiveNpc(null)}
                    recentEvents={events}
                />
            )}
        </section>
    );
}

function NpcRow({ npc, state, content, onClick, showLocation }: {
    npc: NpcDef;
    state: EngineState;
    content: ContentIndex;
    onClick: () => void;
    showLocation: boolean;
}) {
    const entry = state.npcState?.[npc.id];
    const known = entry?.firstMetAtMs !== undefined;
    const affinity = entry?.affinity ?? 0;
    const lastSeen = entry?.lastInteractionMs ? formatAgo(Date.now() - entry.lastInteractionMs) : null;
    const location = content.locationsById[npc.locationId];

    const sub = [
        humanize(npc.role),
        showLocation && location ? location.name : null,
        known && lastSeen ? `seen ${lastSeen}` : null,
        !known ? 'not yet met' : null,
    ].filter(Boolean).join(' · ');

    return (
        <button type="button" className="row-card" onClick={onClick}>
            <div className="grow">
                <div className="list-title">{npc.name}</div>
                <div className="list-sub">{sub}</div>
            </div>
            {known && (
                <div className="affinity">
                    <span className="slot-label">{TIER_LABEL[getAffinityTier(affinity)]}</span>
                    <span className="ok">{affinity}</span>
                </div>
            )}
        </button>
    );
}

function formatAgo(ms: number): string {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
