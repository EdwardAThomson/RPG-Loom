import { describe, it, expect } from 'vitest';
import { createNewState, applyCommand, step } from '../engine';

const mockContent: any = {};

describe('Balance Instrumentation (B9)', () => {
    it('Initializes metrics on new game', () => {
        const startMs = 1000;
        const state = createNewState({ saveId: 'test_metrics', playerId: 'p1', playerName: 'Hero', nowMs: startMs, startLocationId: 'loc_home' });

        expect(state.metrics).toBeDefined();
        expect(state.metrics.startTimeMs).toBe(startMs);
        expect(state.metrics.startXp).toBe(0);
        expect(state.metrics.startGold).toBe(0);
    });

    it('Maintains baseline while state changes', () => {
        const startMs = 1000;
        let state = createNewState({ saveId: 'test_metrics_2', playerId: 'p1', playerName: 'Hero', nowMs: startMs, startLocationId: 'loc_home' });

        // Simulate gained XP/Gold
        state.player.xp = 100;
        state.player.gold = 50;

        // Metrics should stay at baseline
        expect(state.metrics.startXp).toBe(0);
        expect(state.metrics.startGold).toBe(0);
    });

    it('Resets metrics on command', () => {
        const startMs = 1000;
        let state = createNewState({ saveId: 'test_metrics_3', playerId: 'p1', playerName: 'Hero', nowMs: startMs, startLocationId: 'loc_home' });

        // Play for a bit
        state.player.xp = 500;
        state.player.gold = 200;
        const nowMs = 5000;

        // Reset metrics
        const res = applyCommand(state, {
            type: 'RESET_METRICS',
            atMs: nowMs
        });

        expect(res.state.metrics.startTimeMs).toBe(nowMs);
        expect(res.state.metrics.startXp).toBe(500);
        expect(res.state.metrics.startGold).toBe(200);
    });
});
