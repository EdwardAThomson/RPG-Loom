import { describe, it, expect } from 'vitest';
import { createNewState, gainSkillXp } from '../engine';
import type { EngineState } from '@rpg-loom/shared';

describe('XP and Level Summation', () => {
    it('should calculate player XP as sum of skill XP', () => {
        const state: EngineState = createNewState({
            saveId: 'test_save',
            playerId: 'p1',
            playerName: 'Test',
            nowMs: Date.now(),
            startLocationId: 'loc_forest'
        });

        // Initial state: Level 1 in 11 skills (if they exist)
        // Actually skills are initialized on gainSkillXp or if pre-existing.
        // In createNewState, they might be empty or default.

        expect(state.player.xp).toBe(0);
        expect(state.player.combatLevel).toBe(4); // swords, marks, arcana, defense @ Lv 1

        // Gain 50 XP in mining
        gainSkillXp(state, 'mining', 50);
        expect(state.player.skills.mining.xp).toBe(50);
        expect(state.player.xp).toBe(50);
        expect(state.player.combatLevel).toBe(4); // Mining is not a combat skill

        // Gain 70 XP in woodcutting
        gainSkillXp(state, 'woodcutting', 70);
        expect(state.player.skills.woodcutting.xp).toBe(70);
        expect(state.player.xp).toBe(120);
    });

    it('should calculate player Level as sum of skill levels', () => {
        const state: EngineState = createNewState({
            saveId: 'test_save',
            playerId: 'p1',
            playerName: 'Test',
            nowMs: Date.now(),
            startLocationId: 'loc_forest'
        });

        // In createNewState, 10 skills are initialized at level 1.
        expect(state.player.level).toBe(10);
        const initialLevel = state.player.level;

        // Level up mining (requires 100 XP for Level 2)
        gainSkillXp(state, 'mining', 100);
        expect(state.player.skills.mining.level).toBe(2);
        expect(state.player.level).toBe(initialLevel + 1);

        // Level up woodcutting
        gainSkillXp(state, 'woodcutting', 100);
        expect(state.player.skills.woodcutting.level).toBe(2);
        expect(state.player.level).toBe(initialLevel + 2);
    });
});
