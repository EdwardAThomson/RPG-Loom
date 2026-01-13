import React, { useState } from 'react';
import { EngineState, ContentIndex, PlayerCommand, SkillId } from '@rpg-loom/shared';
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

// Helper: Calculate expected level for given XP (matches engine logic)
function getTotalXpForSkillLevel(level: number): number {
    let total = 0;
    for (let i = 1; i < level; i++) {
        total += Math.floor(100 * Math.pow(1.2, i - 1));
    }
    return total;
}

function getExpectedLevel(xp: number): number {
    let level = 1;
    while (xp >= getTotalXpForSkillLevel(level + 1)) {
        level++;
    }
    return level;
}

export function DebugView({ state, content, dispatch, tickRate, setTickRate, onResetSkills }: Props) {
    const [manualOutput, setManualOutput] = useState<string>('');

    const currentLocation = content.locationsById[state.currentLocationId];

    // Skill Validation
    const skillValidation: Array<{ skillId: SkillId; name: string; currentLevel: number; expectedLevel: number; xp: number; isValid: boolean }> = [];
    const skillNames: Record<SkillId, string> = {
        swordsmanship: 'Melee',
        marksmanship: 'Ranged',
        arcana: 'Magic',
        defense: 'Defense',
        mining: 'Mining',
        woodcutting: 'Woodcutting',
        foraging: 'Foraging',
        blacksmithing: 'Smithing',
        woodworking: 'Woodcraft',
        leatherworking: 'Leatherwork'
    };

    for (const skillId of Object.keys(state.player.skills) as SkillId[]) {
        const skill = state.player.skills[skillId];
        if (skill) {
            const expectedLevel = getExpectedLevel(skill.xp);
            skillValidation.push({
                skillId,
                name: skillNames[skillId] || skillId,
                currentLevel: skill.level,
                expectedLevel,
                xp: skill.xp,
                isValid: skill.level === expectedLevel
            });
        }
    }

    const invalidSkills = skillValidation.filter(s => !s.isValid);

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

            {/* Skill Validation Section */}
            <div style={{ marginBottom: '1rem', border: invalidSkills.length > 0 ? '2px solid #f90' : '1px solid #444', padding: '0.5rem', background: invalidSkills.length > 0 ? 'rgba(255, 153, 0, 0.05)' : 'transparent' }}>
                <h3>Skill Validation</h3>
                {invalidSkills.length === 0 ? (
                    <p style={{ color: '#4caf50', fontSize: '0.9rem' }}>✓ All skills have valid levels</p>
                ) : (
                    <>
                        <p style={{ color: '#f90', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                            ⚠️ Found {invalidSkills.length} skill(s) with invalid levels
                        </p>
                        <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '1rem' }}>
                            {invalidSkills.map(s => (
                                <div key={s.skillId} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', marginBottom: '0.5rem', borderLeft: '3px solid #f90' }}>
                                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{s.name}</div>
                                    <div style={{ color: '#f90' }}>Current Level: {s.currentLevel} (WRONG)</div>
                                    <div style={{ color: '#4caf50' }}>Expected Level: {s.expectedLevel} (CORRECT)</div>
                                    <div style={{ color: '#888' }}>XP: {Math.floor(s.xp).toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                dispatch({ type: 'RESET_SKILLS', atMs: Date.now() });
                            }}
                            style={{
                                width: '100%',
                                border: '2px solid #4caf50',
                                color: '#4caf50',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: '0.75rem',
                                fontSize: '1rem',
                                fontWeight: 'bold'
                            }}
                        >
                            Fix Invalid Levels (No Confirmation)
                        </button>
                        <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.25rem', textAlign: 'center' }}>
                            Instantly recalculates all skill levels based on XP. Preserves all XP.
                        </p>
                    </>
                )}
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
                    <button
                        onClick={onResetSkills}
                        style={{
                            width: '100%',
                            border: '2px solid #f90',
                            color: '#f90',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '0.75rem',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            position: 'relative',
                            zIndex: 10
                        }}
                    >
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
