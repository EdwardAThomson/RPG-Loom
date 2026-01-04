import { describe, it, expect } from 'vitest';
import { createNewState, applyCommand, simulateOffline } from '../engine.js';
import type { PlayerCommand } from '@rpg-loom/shared';

const MOCK_CONTENT: any = {
    itemsById: {
        'item_wood': { id: 'item_wood', name: 'Wood', stackable: true, value: 1, tags: [], description: '', type: 'resource', rarity: 'common' }
    },
    enemiesById: {},
    questTemplatesById: {},
    recipesById: {},
    locationsById: {
        'loc_forest': {
            id: 'loc_forest',
            name: 'Forest',
            description: '',
            woodcuttingTable: { entries: [{ itemId: 'item_wood', weight: 1, minQty: 1, maxQty: 1 }] },
            activities: ['woodcut']
        }
    }
};

describe('Engine Invariants', () => {
    const INIT = {
        saveId: 'save_inv_1',
        playerId: 'p_1',
        playerName: 'Tester',
        nowMs: 1000,
        startLocationId: 'loc_forest'
    };

    it('XP never decreases', () => {
        let state = createNewState(INIT);

        // Do some activities that grant XP
        const cmd: PlayerCommand = { type: 'SET_ACTIVITY', params: { type: 'woodcut', locationId: 'loc_forest' }, atMs: 1000 };
        state = applyCommand(state, cmd, MOCK_CONTENT).state;

        let prevXp = state.player.xp;

        // Sim 50 ticks
        for (let i = 0; i < 50; i++) {
            const res = simulateOffline(state, state.lastTickAtMs, state.lastTickAtMs + 1000, MOCK_CONTENT);
            state = res.state;
            expect(state.player.xp).toBeGreaterThanOrEqual(prevXp);
            prevXp = state.player.xp;
        }
    });

    it('Inventory quantities are never negative', () => {
        let state = createNewState(INIT);
        // Force add item safely to test removal logic if we had it, but here we just check gather.
        // Let's rely on standard loop.
        const cmd: PlayerCommand = { type: 'SET_ACTIVITY', params: { type: 'woodcut', locationId: 'loc_forest' }, atMs: 1000 };
        state = applyCommand(state, cmd, MOCK_CONTENT).state;

        state = simulateOffline(state, 1000, 50000, MOCK_CONTENT).state;

        for (const stack of state.inventory) {
            expect(stack.qty).toBeGreaterThanOrEqual(0);
        }
    });

    it('Stats stay within logical bounds', () => {
        let state = createNewState(INIT);
        expect(state.player.baseStats.hpMax).toBeGreaterThan(0);
        expect(state.player.level).toBeGreaterThanOrEqual(1);
    });
});
