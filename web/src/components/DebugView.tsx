import React, { useState } from 'react';
import { EngineState, ContentIndex, PlayerCommand } from '@rpg-loom/shared';
import { step } from '@rpg-loom/engine';

interface Props {
    state: EngineState;
    content: ContentIndex;
    dispatch: (cmd: PlayerCommand) => void;
    // Engine Controls
    tickRate: number;
    setTickRate: (ms: number) => void;
    onResetSkills: () => void;
}

export function DebugView({ state, content, dispatch, tickRate, setTickRate, onResetSkills }: Props) {
    const [manualOutput, setManualOutput] = useState<string>('');

    const currentLocation = content.locationsById[state.currentLocationId];

    const handleManualTick = () => {
        try {
            // Create a cloned state to avoid mutating manual ref (though step() clones internally anyway)
            // Advance time by 1 tick interval (or more) to ensure engine processes it
            // regardless of race conditions with the main loop.
            const res = step(state, Date.now() + 1000, content);

            const log = res.events.map(e => {
                if (e.type === 'FLAVOR_TEXT') return `FLAVOR: ${e.payload.message}`;
                if (e.type === 'LOOT_GAINED') return `LOOT: ${JSON.stringify(e.payload.items)}`;
                return e.type;
            }).join('\n');

            setManualOutput(`Tick Result:\n${log || 'No Events'}`);
        } catch (e: any) {
            setManualOutput(`Error: ${e.message}\n${e.stack}`);
        }
    };

    return (
        <div className="card" style={{ padding: '1rem' }}>
            <h2>Debug Console</h2>

            <div style={{ marginBottom: '1rem', border: '1px solid #444', padding: '0.5rem' }}>
                <h3>Current Location Data</h3>
                <p><strong>ID:</strong> {state.currentLocationId}</p>
                <p><strong>Found in Content?</strong> {currentLocation ? 'YES' : 'NO'}</p>

                {currentLocation && (
                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify({
                            name: currentLocation.name,
                            activities: currentLocation.activities,
                            hasMining: !!currentLocation.miningTable,
                            hasWood: !!currentLocation.woodcuttingTable,
                            hasForage: !!currentLocation.foragingTable,
                            // Dump table detail if needed
                            woodcuttingTable: currentLocation.woodcuttingTable
                        }, null, 2)}
                    </div>
                )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <h3>Activity State</h3>
                <div style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {JSON.stringify(state.activity, null, 2)}
                </div>
            </div>

            <div style={{ marginBottom: '1rem', border: '1px solid #444', padding: '0.5rem' }}>
                <h3>Engine Settings</h3>
                <div style={{ fontSize: '0.8rem', color: '#666', fontFamily: 'monospace', marginBottom: '1rem' }}>
                    Tick Index: {state.tickIndex}<br />
                    Last Tick: {new Date(state.lastTickAtMs).toLocaleTimeString()}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>Speed:</span>
                    <button onClick={() => setTickRate(1000)} style={{ flex: 1, background: tickRate === 1000 ? 'rgba(255, 215, 0, 0.1)' : '#222', borderColor: tickRate === 1000 ? 'var(--color-gold)' : '#333' }}>Normal (1s)</button>
                    <button onClick={() => setTickRate(100)} style={{ flex: 1, background: tickRate === 100 ? 'rgba(255, 215, 0, 0.2)' : '#222', borderColor: tickRate === 100 ? 'var(--color-gold)' : '#333' }}>Fast (0.1s)</button>
                </div>

                <div style={{ marginTop: '1rem', borderTop: '1px dashed #333', paddingTop: '1rem' }}>
                    <button onClick={onResetSkills} style={{ width: '100%', borderColor: '#f90', color: '#f90', background: 'transparent', cursor: 'pointer' }}>
                        Recalculate Levels
                    </button>
                    <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.25rem', textAlign: 'center' }}>
                        Adjusts levels to new difficulty. Preserves Total XP.
                    </p>
                </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <h3>Actions</h3>
                <button onClick={handleManualTick} style={{ padding: '0.5rem 1rem', background: '#444', color: 'white', border: 'none', cursor: 'pointer' }}>
                    Force One Tick (Client Side)
                </button>
            </div>

            <div style={{ marginBottom: '1rem', border: '1px solid #444', padding: '0.5rem' }}>
                <h3>Item Spawner</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {Object.values(content.itemsById).map((item: any) => (
                        <button
                            key={item.id}
                            onClick={() => dispatch({ type: 'DEBUG_ADD_ITEM', itemId: item.id, qty: 1, atMs: Date.now() })}
                            style={{ padding: '0.3rem', fontSize: '0.8rem', cursor: 'pointer', background: '#222', color: 'var(--color-gold)', border: '1px solid #444' }}
                        >
                            + {item.name}
                        </button>
                    ))}
                    {Object.keys(content.itemsById).length === 0 && <div>No items found in content.</div>}
                </div>
            </div>

            <div style={{ border: '1px solid #444', padding: '0.5rem', background: '#111', minHeight: '100px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {manualOutput}
            </div>
        </div>
    );
}
