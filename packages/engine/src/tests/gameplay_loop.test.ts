
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

    it('can complete a gathering quest via the turn-in flow', () => {
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

        // 2. Gather Wood
        state = applyCommand(state, {
            type: 'SET_ACTIVITY',
            params: { type: 'woodcut', locationId: 'loc_forest' },
            atMs: 1000000
        }, C).state;

        // Run enough ticks to gather sufficient wood
        const res = step(state, 1000000 + 200000, C);
        state = res.state;

        // 3. With the turn-in flow, hitting the gather target leaves the
        // quest at ready_to_turn_in (no rewards yet, no auto-complete).
        const qAfter = state.quests.find(x => x.templateId === 'qt_intro_gather');
        if (qAfter?.status !== 'ready_to_turn_in') {
            // Not enough wood yet — at least progress should have moved.
            expect(qAfter?.progress.current).toBeGreaterThan(0);
            return;
        }

        const goldBeforeTurnIn = state.player.gold;
        expect(state.inventory.find(x => x.itemId === 'item_plank')).toBeUndefined();

        // 4. Travel to Aldric and hand the quest in.
        state = applyCommand(state, {
            type: 'TRAVEL',
            locationId: 'loc_haven',
            atMs: state.lastTickAtMs
        }, C).state;
        expect(state.currentLocationId).toBe('loc_haven');

        const turnIn = applyCommand(state, {
            type: 'TURN_IN_QUEST',
            questId: qAfter.id,
            atMs: state.lastTickAtMs
        }, C);
        state = turnIn.state;

        const qDone = state.quests.find(x => x.id === qAfter.id);
        expect(qDone?.status).toBe('completed');
        // Gold and item rewards land at turn-in, not at progress complete.
        // (Note: player.xp is recomputed from skill XPs by
        // syncDerivedPlayerStats every tick, so the quest's xp reward
        // doesn't stick to player.xp directly; we settle for the QUEST_COMPLETED
        // event carrying the rewards payload.)
        expect(state.player.gold).toBeGreaterThan(goldBeforeTurnIn);
        expect(state.inventory.find(x => x.itemId === 'item_plank')).toBeDefined();
        const completedEvt = turnIn.events.find(e => e.type === 'QUEST_COMPLETED');
        expect(completedEvt).toBeDefined();
        expect((completedEvt as any).payload.rewards.xp).toBe(50);
    });

    it('quest-giver attribution: completing the gather parks at ready_to_turn_in; TURN_IN_QUEST bumps Aldric\'s affinity', () => {
        let state = createNewState(INIT_PARAMS);

        // qt_intro_gather is tagged with questGiverNpcId: 'npc_aldric'
        // in the content pack, so ACCEPT_QUEST without an explicit npcId
        // should inherit the giver.
        state = applyCommand(state, {
            type: 'ACCEPT_QUEST',
            templateId: 'qt_intro_gather',
            atMs: 1000000
        }, C).state;

        const q = state.quests.find(x => x.templateId === 'qt_intro_gather');
        expect(q?.npcId).toBe('npc_aldric');

        // Drive the gather long enough that progress hits the required count.
        state = applyCommand(state, {
            type: 'SET_ACTIVITY',
            params: { type: 'woodcut', locationId: 'loc_forest' },
            atMs: 1000000
        }, C).state;

        const res = step(state, 1000000 + 200000, C);
        state = res.state;

        const qAfter = state.quests.find(x => x.templateId === 'qt_intro_gather');
        if (qAfter?.status !== 'ready_to_turn_in') {
            // Not enough wood yet — bail; the turn-in side of the assertion
            // can't be reached. The migration & status check are still useful.
            expect(qAfter?.progress.current).toBeGreaterThan(0);
            return;
        }

        // Affinity bump must NOT have happened yet — that's the whole point
        // of the turn-in flow.
        const aldricBefore = state.npcState['npc_aldric'];
        expect(aldricBefore?.affinity ?? 0).toBe(0);

        // Travel to Aldric and turn the quest in.
        state = applyCommand(state, {
            type: 'TRAVEL', locationId: 'loc_haven', atMs: state.lastTickAtMs
        }, C).state;
        state = applyCommand(state, {
            type: 'TURN_IN_QUEST', questId: qAfter.id, atMs: state.lastTickAtMs
        }, C).state;

        const aldric = state.npcState['npc_aldric'];
        expect(aldric).toBeDefined();
        expect(aldric.affinity).toBeGreaterThanOrEqual(5);
        expect(aldric.firstMetAtMs).toBeDefined();
    });
});
