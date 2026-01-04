
import { describe, it, expect } from 'vitest';
import { createNewState, applyCommand, recalculateStats } from '../src/engine.js';
import { ContentIndex, ItemDef } from '@rpg-loom/shared';

describe('Equipment Stats', () => {
    it('should increase stats when equipping items', () => {
        const now = 1000;
        let state = createNewState({
            saveId: 'test_eq',
            playerId: 'p1',
            playerName: 'TestRef',
            nowMs: now,
            startLocationId: 'loc1'
        });

        const initialAtk = state.player.baseStats.atk;

        // Mock Content
        const mockSword: ItemDef = {
            id: 'sword_1',
            name: 'Test Sword',
            type: 'weapon',
            rarity: 'common',
            description: '',
            stackable: false,
            value: 10,
            modifiers: { atk: 5 }
        };

        const content: ContentIndex = {
            itemsById: { 'sword_1': mockSword },
            enemiesById: {},
            locationsById: {},
            questTemplatesById: {},
            recipesById: {}
        };

        // Add item to inventory
        state.inventory.push({ itemId: 'sword_1', qty: 1 });

        // Equip
        const res = applyCommand(state, {
            type: 'EQUIP_ITEM',
            itemId: 'sword_1',
            slot: 'weapon',
            atMs: now
        }, content);

        state = res.state;

        // Verify Atk increased
        expect(state.player.baseStats.atk).toBe(initialAtk + 5);

        // Verify Intrinsic didn't change (if exposed? accessible via state.player.intrinsicStats)
        if (state.player.intrinsicStats) {
            expect(state.player.intrinsicStats.atk).toBe(initialAtk);
        }

        // Unequip
        const res2 = applyCommand(state, {
            type: 'UNEQUIP_ITEM',
            slot: 'weapon',
            atMs: now
        }, content);

        state = res2.state;

        // Verify Atk back to normal
        expect(state.player.baseStats.atk).toBe(initialAtk);
    });
});
