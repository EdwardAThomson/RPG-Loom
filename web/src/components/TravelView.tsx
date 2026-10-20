import { useMemo, useState } from 'react';
import { Lock, MapPin } from 'lucide-react';
import { EngineState, PlayerCommand, LocationDef } from '@rpg-loom/shared';
import { WorldMap, MapStop } from './WorldMap';
import { enemyName, itemName } from '../ui/labels';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

/** Mirrors the engine's TRAVEL checks; null when the player may go. */
function lockReason(loc: LocationDef, state: EngineState): string | null {
    const r = loc.requirements;
    if (!r) return null;
    const { player } = state;
    if (r.minLevel && player.level < r.minLevel) return `Total level ${r.minLevel}`;
    if (r.minCombatLevel && player.combatLevel < r.minCombatLevel) return `Combat level ${r.minCombatLevel}`;
    if (r.minAtk && player.baseStats.atk < r.minAtk) return `Attack ${r.minAtk}`;
    if (r.minDef && player.baseStats.def < r.minDef) return `Defence ${r.minDef}`;
    return null;
}

function names(ids: string[], limit = 3): string {
    const shown = ids.slice(0, limit).join(', ');
    return ids.length > limit ? `${shown} and ${ids.length - limit} more` : shown;
}

export function TravelView({ state, dispatch, content }: Props) {
    const locations: LocationDef[] = content?.locationsById ? Object.values(content.locationsById) : [];
    const [selectedId, setSelectedId] = useState<string | null>(state.currentLocationId);

    // Progression order for the trail: by level requirement, then by the
    // order the content pack lists them.
    const ordered = useMemo(
        () => [...locations].sort((a, b) => (a.requirements?.minLevel ?? 0) - (b.requirements?.minLevel ?? 0)),
        [locations]
    );

    const stops: MapStop[] = ordered
        .filter(l => l.map)
        .map(l => ({
            loc: l,
            x: l.map!.x,
            y: l.map!.y,
            locked: lockReason(l, state) !== null,
            current: l.id === state.currentLocationId,
        }));

    const selected = ordered.find(l => l.id === selectedId) ?? null;
    const travel = (id: string) => dispatch({ type: 'TRAVEL', locationId: id, atMs: Date.now() });

    return (
        <div className="stack">
            <section className="card">
                <h2>World map</h2>
                <WorldMap stops={stops} selectedId={selectedId} onSelect={setSelectedId} />
                {selected && <LocationDetail loc={selected} state={state} content={content} onTravel={travel} />}
            </section>

            <section className="card">
                <h2>All destinations</h2>
                <div className="list">
                    {ordered.map(loc => {
                        const reason = lockReason(loc, state);
                        const current = loc.id === state.currentLocationId;
                        return (
                            <div
                                key={loc.id}
                                className={`row-card${current ? ' is-active' : ''}${reason ? ' is-locked' : ''}`}
                            >
                                <div className="grow">
                                    <div className="list-title">
                                        {loc.name}
                                        {current && <span className="chip chip-ok">Here</span>}
                                    </div>
                                    <div className="list-sub">
                                        {reason ? `Needs ${reason.toLowerCase()}` : loc.type === 'town' ? 'Town' : `Level ${loc.requirements?.minLevel ?? 1} region`}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn-sm"
                                    disabled={current || !!reason}
                                    onClick={() => { setSelectedId(loc.id); if (!reason && !current) travel(loc.id); }}
                                >
                                    {current ? 'Here' : reason ? <Lock size={12} aria-label="Locked" /> : 'Travel'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

function LocationDetail({ loc, state, content, onTravel }: {
    loc: LocationDef;
    state: EngineState;
    content: any;
    onTravel: (id: string) => void;
}) {
    const reason = lockReason(loc, state);
    const current = loc.id === state.currentLocationId;
    const resources = [loc.miningTable, loc.woodcuttingTable, loc.foragingTable]
        .flatMap(t => t?.entries ?? [])
        .map(e => itemName(content, e.itemId));
    const hazards = (loc.encounterTable?.entries ?? []).map(e => enemyName(content, e.enemyId));

    return (
        <div className="map-detail">
            {loc.image && <div className="map-detail-art" style={{ backgroundImage: `url("${loc.image}")` }} />}
            <div className="grow">
                <div className="map-detail-head">
                    <h3>{loc.name}</h3>
                    {current ? (
                        <span className="chip chip-ok"><MapPin size={11} aria-hidden /> You are here</span>
                    ) : reason ? (
                        <span className="chip chip-warn"><Lock size={11} aria-hidden /> Needs {reason.toLowerCase()}</span>
                    ) : (
                        <button type="button" className="primary btn-sm" onClick={() => onTravel(loc.id)}>Travel here</button>
                    )}
                </div>
                {loc.description && <p className="prose">{loc.description}</p>}
                <dl className="map-facts">
                    {loc.type === 'town' ? (
                        <div><dt>Services</dt><dd>Inn, market and training</dd></div>
                    ) : (
                        <>
                            <div><dt>Resources</dt><dd>{resources.length ? names([...new Set(resources)]) : 'None'}</dd></div>
                            <div><dt>Dangers</dt><dd>{hazards.length ? names([...new Set(hazards)]) : 'Safe'}</dd></div>
                        </>
                    )}
                </dl>
            </div>
        </div>
    );
}
