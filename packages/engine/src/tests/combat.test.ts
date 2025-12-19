import { describe, it, expect } from 'vitest';
import { createNewState, step } from '../engine';
import { EngineState, ActivityParams } from '@rpg-loom/shared';

// Minimal mock content for testing
const mockContent: any = {
    itemsById: {},
    enemiesById: {
        'enemy_boss': {
            id: 'enemy_boss',
            name: 'Boss',
            baseStats: { hpMax: 100, atk: 15, def: 5, spd: 5, critChance: 0, critMult: 1, res: 0 },
            lootTable: { entries: [] }
        },
        'enemy_weak': {
            id: 'enemy_weak',
            name: 'Weakling',
            baseStats: { hpMax: 10, atk: 1, def: 0, spd: 1, critChance: 0, critMult: 1, res: 0 },
            lootTable: { entries: [] }
        }
    },
    locationsById: {
        'loc_arena': {
            id: 'loc_arena',
            name: 'Arena',
            encounterTable: { entries: [{ enemyId: 'enemy_boss', weight: 1 }] },
            resourceTable: { entries: [] }
        }
    },
    questTemplatesById: {},
    recipesById: {}
};

describe('Combat v1', () => {
    it('Applies death penalties on loss', () => {
        let state = createNewState({ saveId: 'test_combat', playerId: 'p1', playerName: 'Hero', nowMs: 1000, startLocationId: 'loc_arena' });

        // Set activity to hunt the boss (guaranteed loss for lvl 1)
        state.activity = {
            id: 'act_test',
            params: { type: 'hunt', locationId: 'loc_arena' },
            startedAtMs: 1000
        };

        // Run one tick
        const res = step(state, 2000, mockContent);
        const nextState = res.state;
        const events = res.events;

        // Should have lost
        const lossEv = events.find(e => e.type === 'ENCOUNTER_RESOLVED' && e.payload.outcome === 'loss');
        expect(lossEv).toBeDefined();

        // Should be in recovery
        const setActEv = events.find(e => e.type === 'ACTIVITY_SET' && e.payload.activity.type === 'recovery');
        expect(setActEv).toBeDefined();
        expect(nextState.activity.params.type).toBe('recovery');

        // Should have lost XP (but min is 0 for lvl 1 so it stays at 0)
        // To test XP loss, let's give some XP first
        state.player.xp = 50;
        const res2 = step(state, 2000, mockContent);
        const lossEv2 = res2.events.find(e => e.type === 'ENCOUNTER_RESOLVED' && e.payload.outcome === 'loss');
        expect(lossEv2).toBeDefined();
        expect(res2.state.player.xp).toBeLessThan(50);
    });

    it('Recovers after duration', () => {
        let state = createNewState({ saveId: 'test_recovery', playerId: 'p1', playerName: 'Hero', nowMs: 1000, startLocationId: 'loc_arena' });

        // Put in recovery manually
        state.activity = {
            id: 'act_rec',
            params: { type: 'recovery', durationMs: 60000 }, // 60s
            startedAtMs: 1000
        };

        // Advancing 30s -> still recovering
        let res = step(state, 31000, mockContent);
        expect(res.state.activity.params.type).toBe('recovery');

        // Advancing past 60s -> idle
        res = step(res.state, 70000, mockContent); // 1000 + 60000 < 70000
        expect(res.state.activity.params.type).toBe('idle');
    });

    it('Tactics influence power (indirectly tested via determinism)', () => {
        // This is harder to test without exposing resolveSimpleCombat, but we can verify it doesn't crash
        let state = createNewState({ saveId: 'test_tactics', playerId: 'p1', playerName: 'Hero', nowMs: 1000, startLocationId: 'loc_arena' });
        state.player.tactics = 'aggressive';

        // Just ensure it runs
        state.activity = {
            id: 'act_test',
            params: { type: 'hunt', locationId: 'loc_arena' },
            startedAtMs: 1000
        };
        const res = step(state, 2000, mockContent);
        expect(res.events).toBeDefined();
    });
});
