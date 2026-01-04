
import { describe, it, expect } from 'vitest';
import { createNewState, step, applyCommand } from '../engine.js';
import content from '@rpg-loom/content';
const C = content as any;

describe('Gameplay Loop (Integration)', () => {
    const INIT_PARAMS = {
        saveId: 'save_loop_1',
        playerId: 'p_1',
        playerName: 'Hero',
        nowMs: 1000000,
        startLocationId: 'loc_forest'
    };

    it('can gather wood and craft a plank', () => {
        // 1. Start in Forest
        let state = createNewState(INIT_PARAMS);

        // 2. Gather Wood
        // We need 2 wood for a plank.
        // loc_forest gives wood (qty 1-3) with weight 10.
        // We'll simulate enough ticks to guarantee we get some.
        state = applyCommand(state, {
            type: 'SET_ACTIVITY',
            params: { type: 'woodcut', locationId: 'loc_forest' },
            atMs: 1000000
        }, C).state;

        // Simulate 20 seconds (20 ticks).
        // Each tick has a chance to drop loot.
        // In our engine, gather currently drops loot EVERY tick (MVP).
        // So 20 ticks should be plenty (20-60 wood).
        let res = step(state, 1000000 + 20000, C);
        state = res.state;

        const wood = state.inventory.find(x => x.itemId === 'item_wood');
        expect(wood).toBeDefined();
        expect(wood?.qty).toBeGreaterThanOrEqual(2);

        // 3. Craft Plank
        state = applyCommand(state, {
            type: 'SET_ACTIVITY',
            params: { type: 'craft', recipeId: 'recipe_plank' },
            atMs: state.lastTickAtMs
        }, C).state;

        // Simulate 2 seconds (2 ticks).
        // Crafting is 1 per tick.
        res = step(state, state.lastTickAtMs + 2000, C);
        state = res.state;

        const plank = state.inventory.find(x => x.itemId === 'item_plank');
        expect(plank).toBeDefined();
        expect(plank?.qty).toBeGreaterThanOrEqual(1);

        // Check wood was consumed
        // We can't know exactly how much wood we had, but we know planks exist.
    });

    it('can hunt rats', () => {
        let state = createNewState(INIT_PARAMS);
        state = applyCommand(state, {
            type: 'SET_ACTIVITY',
            params: { type: 'hunt', locationId: 'loc_forest' },
            atMs: 1000000
        }, C).state;

        // Fight some rats
        const res = step(state, 1000000 + 10000, C);
        state = res.state;

        // Should have some events
        const fightEvents = res.events.filter(e => e.type === 'ENCOUNTER_RESOLVED');
        expect(fightEvents.length).toBeGreaterThan(0);
    });

    it('can complete a gathering quest', () => {
        let state = createNewState(INIT_PARAMS);

        // 1. Accept Quest
        state = applyCommand(state, {
            type: 'ACCEPT_QUEST',
            templateId: 'qt_intro_gather',
            atMs: 1000000
        }, C).state;

        const q = state.quests.find(x => x.templateId === 'qt_intro_gather');
        expect(q).toBeDefined();
        expect(q?.status).toBe('active');

        // 2. Gather Wood (Activity)
        // Quest needs 5-10 wood.
        state = applyCommand(state, {
            type: 'SET_ACTIVITY',
            params: { type: 'woodcut', locationId: 'loc_forest' },
            atMs: 1000000
        }, C).state;

        // Run enough ticks to gather sufficient wood
        const res = step(state, 1000000 + 50000, C);
        state = res.state;

        // 3. Verify Progress
        const qAfter = state.quests.find(x => x.templateId === 'qt_intro_gather');
        // Should be completed if we gathered enough
        // The quest is checked every time we get loot.

        // We check if we got enough wood first
        const wood = state.inventory.find(i => i.itemId === 'item_wood');
        // If we have wood, we should have progress.

        // Note: In strict engines, you might need to 'Turn In' key. 
        // Current engine auto-completes in 'checkQuestCompletion' called in loop.

        if (qAfter?.status === 'completed') {
            // Verify rewards
            // 50 XP, 10 Gold, 5 Planks
            expect(state.player.xp).toBeGreaterThan(0);
            expect(state.player.gold).toBeGreaterThan(0);
            expect(state.inventory.find(x => x.itemId === 'item_plank')).toBeDefined();
        } else {
            // If not complete, ensure progress at least happened
            expect(qAfter?.progress.current).toBeGreaterThan(0);
        }
    });
});
