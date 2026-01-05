import { describe, it, expect } from 'vitest';
import { createNewState, recalculateStats, gainSkillXp } from '../src/engine.js';
import type { ContentIndex } from '@rpg-loom/shared';

// Minimal mock content for recalculateStats (needs items to not crash, but we focus on skills)
const mockContent: ContentIndex = {
    itemsById: {},
    enemiesById: {},
    locationsById: {},
    questTemplatesById: {},
    recipesById: {}
};

describe('Skill Stat Scaling', () => {
    it('should increase ATK when swordsmanship levels up', () => {
        const state = createNewState({
            saveId: 'test',
            playerId: 'p1',
            playerName: 'Hero',
            nowMs: 1000,
            startLocationId: 'loc1'
        });

        // Baseline
        const initialAtk = state.player.baseStats.atk;
        expect(state.player.skills.swordsmanship.level).toBe(1);

        // Level up swordsmanship to 2
        state.player.skills.swordsmanship.level = 2;
        recalculateStats(state, mockContent);

        // swordsmanship: +1 ATK per level
        // Delta should be +1
        expect(state.player.baseStats.atk).toBe(initialAtk + 1);
    });

    it('should increase SPD and Crit when marksmanship levels up', () => {
        const state = createNewState({
            saveId: 'test',
            playerId: 'p1',
            playerName: 'Hero',
            nowMs: 1000,
            startLocationId: 'loc1'
        });

        const initialSpd = state.player.baseStats.spd;
        const initialCrit = state.player.baseStats.critChance;

        // +10 levels
        state.player.skills.marksmanship.level = 11; // +10 from base 1
        recalculateStats(state, mockContent);

        // +1 SPD per level -> +10
        expect(state.player.baseStats.spd).toBe(initialSpd + 10);
        // +0.5% Crit per level -> +5% => +0.05
        expect(state.player.baseStats.critChance).toBeCloseTo(initialCrit + 0.05);
    });

    it('should increase DEF and HP when defense levels up', () => {
        const state = createNewState({
            saveId: 'test',
            playerId: 'p1',
            playerName: 'Hero',
            nowMs: 1000,
            startLocationId: 'loc1'
        });

        const initialDef = state.player.baseStats.def;
        const initialHpMax = state.player.baseStats.hpMax;

        // +4 levels (Lvl 5)
        state.player.skills.defense.level = 5;
        recalculateStats(state, mockContent);

        // +1 DEF per level -> +4
        expect(state.player.baseStats.def).toBe(initialDef + 4);
        // +5 HP per level -> +20
        expect(state.player.baseStats.hpMax).toBe(initialHpMax + 20);
    });
});
