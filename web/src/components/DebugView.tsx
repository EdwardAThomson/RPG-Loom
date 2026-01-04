import React, { useState } from 'react';
import { EngineState, ContentIndex, PlayerCommand } from '@rpg-loom/shared';
import { step } from '@rpg-loom/engine';

interface Props {
    state: EngineState;
    content: ContentIndex;
    dispatch: (cmd: PlayerCommand) => void;
}

export function DebugView({ state, content, dispatch }: Props) {
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

            <div style={{ marginBottom: '1rem' }}>
                <h3>Actions</h3>
                <button onClick={handleManualTick} style={{ padding: '0.5rem 1rem', background: '#444', color: 'white', border: 'none', cursor: 'pointer' }}>
                    Force One Tick (Client Side)
                </button>
            </div>

            <div style={{ border: '1px solid #444', padding: '0.5rem', background: '#111', minHeight: '100px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {manualOutput}
            </div>
        </div>
    );
}
