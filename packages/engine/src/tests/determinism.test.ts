
import { describe, it, expect } from 'vitest';
import { createNewState, step, applyCommand, simulateOffline } from '../engine.js';
import type { PlayerCommand, ActivityParams, EngineState } from '@rpg-loom/shared';

// Mock content index for testing
const MOCK_CONTENT: any = {
    itemsById: {
        'item_wood': { id: 'item_wood', name: 'Wood', stackable: true, value: 1 },
        'item_sword': { id: 'item_sword', name: 'Sword', stackable: false, value: 10 }
    },
    enemiesById: {
        'enemy_rat': {
            id: 'enemy_rat',
            name: 'Rat',
            baseStats: { hpMax: 5, atk: 2, def: 0, spd: 3, critChance: 0, critMult: 1, res: 0 },
            lootTable: { entries: [{ itemId: 'item_wood', minQty: 1, maxQty: 1, weight: 1 }] }
        }
    },
    locationsById: {
        'loc_forest': {
            id: 'loc_forest',
            name: 'Forest',
            encounterTable: { entries: [{ enemyId: 'enemy_rat', weight: 1 }] },
            resourceTable: { entries: [{ itemId: 'item_wood', minQty: 1, maxQty: 2, weight: 1 }] }
        }
    },
    questTemplatesById: {},
    recipesById: {}
};

describe('Engine Determinism', () => {
    const INIT_PARAMS = {
        saveId: 'save_det_1',
        playerId: 'p_1',
        playerName: 'Tester',
        nowMs: 1000000,
        startLocationId: 'loc_forest'
    };

    it('produce identical output for identical steps (Golden Run)', () => {
        // RUN 1
        const s1 = createNewState(INIT_PARAMS);
        // Apply a command
        const cmd1: PlayerCommand = {
            type: 'SET_ACTIVITY',
            params: { type: 'gather', locationId: 'loc_forest' },
            atMs: 1000100
        };
        const { state: s1_postCmd } = applyCommand(s1, cmd1, MOCK_CONTENT);
        // Simulate 100 ticks
        const targetMs = 1000100 + (100 * 1000);
        const { state: s1_end, events: ev1 } = simulateOffline(s1_postCmd, 1000100, targetMs, MOCK_CONTENT);

        // RUN 2 (fresh state)
        const s2 = createNewState(INIT_PARAMS);
        const cmd2: PlayerCommand = {
            type: 'SET_ACTIVITY',
            params: { type: 'gather', locationId: 'loc_forest' },
            atMs: 1000100
        };
        const { state: s2_postCmd } = applyCommand(s2, cmd2, MOCK_CONTENT);
        const { state: s2_end, events: ev2 } = simulateOffline(s2_postCmd, 1000100, targetMs, MOCK_CONTENT);

        // Deep equality check
        expect(s1_end).toEqual(s2_end);
        expect(ev1).toEqual(ev2);

        // Check specific seeded values to ensure RNG isn't just "doing nothing"
        // With a gather activity in forest, we expect some wood.
        const wood1 = s1_end.inventory.find(i => i.itemId === 'item_wood');
        expect(wood1).toBeDefined();
        expect(wood1?.qty).toBeGreaterThan(0);
    });
});
