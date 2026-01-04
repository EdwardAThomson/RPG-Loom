import React from 'react';
import { EngineState, PlayerCommand, LocationDef } from '@rpg-loom/shared';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

export function TravelView({ state, dispatch, content }: Props) {
    const locations: LocationDef[] = content?.locationsById ? Object.values(content.locationsById) : [];
    const { player, currentLocationId } = state;

    const canTravel = (loc: LocationDef) => {
        if (!loc.requirements) return true;
        if (loc.requirements.minLevel && player.level < loc.requirements.minLevel) return false;
        return true;
    };

    const handleTravel = (locId: string) => {
        dispatch({ type: 'TRAVEL', locationId: locId, atMs: Date.now() });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <section className="card">
                <h2>World Map</h2>
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {locations.map(loc => {
                        const isCurrent = currentLocationId === loc.id;
                        const locked = !canTravel(loc);
                        const minLevel = loc.requirements?.minLevel || 1;

                        return (
                            <div key={loc.id} style={{
                                background: isCurrent ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0,0,0,0.2)',
                                border: isCurrent ? '1px solid var(--color-gold)' : '1px solid #333',
                                padding: '1rem',
                                borderRadius: '4px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                opacity: locked ? 0.6 : 1
                            }}>
                                <div>
                                    <h3 style={{ margin: '0 0 0.5rem 0', color: isCurrent ? 'var(--color-gold)' : '#fff' }}>
                                        {loc.name} {isCurrent && "(Current)"}
                                    </h3>
                                    <div style={{ fontSize: '0.9rem', color: '#aaa', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                                        {loc.description}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: locked ? '#f55' : '#888' }}>
                                        Rec. Level: {minLevel}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>
                                        Resources: {getDropNames(loc.miningTable || loc.woodcuttingTable || loc.foragingTable, content)} | Hazards: {getEnemyNames(loc.encounterTable, content)}
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleTravel(loc.id)}
                                    disabled={isCurrent || locked}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: isCurrent ? 'transparent' : (locked ? '#333' : '#444'),
                                        border: '1px solid',
                                        borderColor: isCurrent ? 'var(--color-gold)' : '#555',
                                        color: isCurrent ? 'var(--color-gold)' : '#fff',
                                        cursor: isCurrent || locked ? 'default' : 'pointer',
                                        minWidth: '100px'
                                    }}
                                >
                                    {isCurrent ? 'Here' : (locked ? 'Locked' : 'Travel')}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

// Helpers for previewing drops/enemies
function getDropNames(table: any, content: any): string {
    if (!table?.entries) return "None";
    const names = table.entries.slice(0, 3).map((e: any) => content.itemsById[e.itemId]?.name).filter(Boolean);
    return names.join(", ") + (table.entries.length > 3 ? "..." : "");
}

function getEnemyNames(table: any, content: any): string {
    if (!table?.entries) return "Safe";
    const names = table.entries.slice(0, 3).map((e: any) => content.enemiesById[e.enemyId]?.name).filter(Boolean);
    return names.join(", ") + (table.entries.length > 3 ? "..." : "");
}
