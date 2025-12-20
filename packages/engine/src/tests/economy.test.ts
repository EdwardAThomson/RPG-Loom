import { describe, it, expect } from 'vitest';
import { createNewState, step } from '../engine';

// Minimal mock content for testing (needed for step function type signature, even if unused for training)
const mockContent: any = {
    itemsById: {},
    enemiesById: {},
    locationsById: {},
    questTemplatesById: {},
    recipesById: {}
};

describe('Economy Sinks (B7)', () => {
    it('Training costs 1 gold per tick', () => {
        let state = createNewState({ saveId: 'test_eco_1', playerId: 'p1', playerName: 'Hero', nowMs: 1000, startLocationId: 'loc_home' });
        state.player.gold = 10;
        state.player.skills.swordsmanship.level = 1;

        state.activity = {
            id: 'act_train',
            params: { type: 'train', skillId: 'swordsmanship' },
            startedAtMs: 1000
        };

        // Run 5 ticks (5 seconds)
        const res = step(state, 6000, mockContent);

        expect(res.state.player.gold).toBe(5); // 10 - 5

        // Check events
        const goldEvs = res.events.filter(e => e.type === 'GOLD_CHANGED');
        expect(goldEvs.length).toBe(5);
        expect(goldEvs[0].payload.amount).toBe(-1);
    });

    it('Stops training when gold runs out', () => {
        let state = createNewState({ saveId: 'test_eco_2', playerId: 'p1', playerName: 'Hero', nowMs: 1000, startLocationId: 'loc_home' });
        state.player.gold = 2;

        state.activity = {
            id: 'act_train',
            params: { type: 'train', skillId: 'swordsmanship' },
            startedAtMs: 1000
        };

        // Run 5 ticks -> should stop after 2
        const res = step(state, 6000, mockContent);

        expect(res.state.player.gold).toBe(0);
        // Should be idle now
        expect(res.state.activity.params.type).toBe('idle');

        // Should have explanation error
        const err = res.events.find(e => e.type === 'ERROR' && e.payload.code === 'INSUFFICIENT_GOLD');
        expect(err).toBeDefined();
    });
});
