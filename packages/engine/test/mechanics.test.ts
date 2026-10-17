import { describe, it, expect } from 'vitest';
import { createNewState, gainSkillXp, recalculateStats, applyCommand, syncDerivedPlayerStats, getTotalXpForSkillLevel } from '../src/engine.js';
import type { ContentIndex, LocationDef } from '@rpg-loom/shared';

// Mock Content
const mockLocations: Record<string, LocationDef> = {
    'loc_easy': {
        id: 'loc_easy',
        name: 'Easy Zone',
        description: '',
        activities: [],
        encounterTable: { entries: [] },
        requirements: { minLevel: 1 }
    },
    'loc_hard_stat': {
        id: 'loc_hard_stat',
        name: 'Hard Stat Zone',
        description: '',
        activities: [],
        encounterTable: { entries: [] },
        requirements: { minAtk: 100, minDef: 100 }
    },
    'loc_combat_gate': {
        id: 'loc_combat_gate',
        name: 'Combat Gate Zone',
        description: '',
        activities: [],
        encounterTable: { entries: [] },
        requirements: { minCombatLevel: 10 }
    }
};

const mockContent: ContentIndex = {
    itemsById: {},
    enemiesById: {},
    locationsById: mockLocations,
    questTemplatesById: {},
    recipesById: {}
};

describe('Balance Mechanics', () => {

    describe('Exponential XP Curve', () => {
        it('should require increasing XP for higher levels', () => {
            const state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });
            const skillId = 'swordsmanship';

            // Level 1 -> 2: 30 (front-loaded early steps 30/60/100/140)
            expect(state.player.skills[skillId].level).toBe(1);
            gainSkillXp(state, skillId, 20);
            expect(state.player.skills[skillId].level).toBe(1); // Not enough
            gainSkillXp(state, skillId, 10);
            expect(state.player.skills[skillId].level).toBe(2); // Ding!

            // Level 2 -> 3: 60. Total for Lvl 3: 90.
            gainSkillXp(state, skillId, 65); // 30 + 65 = 95
            expect(state.player.skills[skillId].level).toBe(3);
            expect(state.player.skills[skillId].xp).toBe(95);

            // Each step costs more than the last, through the switch to the 1.2x curve
            let prevStep = 0;
            for (let lvl = 1; lvl < 30; lvl++) {
                const stepXp = getTotalXpForSkillLevel(lvl + 1) - getTotalXpForSkillLevel(lvl);
                expect(stepXp).toBeGreaterThan(prevStep);
                prevStep = stepXp;
            }
        });
    });

    describe('Access Requirements', () => {
        it('should block travel if stats are too low', () => {
            let state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });
            // Base stats are low (e.g. 5 ATK, 0 DEF + intrinsic)

            const res = applyCommand(state, {
                type: 'TRAVEL',
                locationId: 'loc_hard_stat',
                atMs: 10
            }, mockContent);

            const errorEvent = res.events.find(e => e.type === 'ERROR');
            expect(errorEvent).toBeDefined();
            expect(errorEvent?.payload.code).toBe('STAT_TOO_LOW');
            expect(res.state.currentLocationId).toBe('loc_easy'); // Did not move
        });

        it('should allow travel if stats are sufficient', () => {
            let state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });

            // Hack stats
            state.player.baseStats.atk = 150;
            state.player.baseStats.def = 150;

            const res = applyCommand(state, {
                type: 'TRAVEL',
                locationId: 'loc_hard_stat',
                atMs: 10
            }, mockContent);

            expect(res.events.find(e => e.type === 'ERROR')).toBeUndefined();
            expect(res.state.currentLocationId).toBe('loc_hard_stat');
        });

        it('should block travel if combat level is too low', () => {
            let state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });
            // Initial combat level is 4 (4 skills @ lvl 1)

            const res = applyCommand(state, {
                type: 'TRAVEL',
                locationId: 'loc_combat_gate',
                atMs: 10
            }, mockContent);

            const errorEvent = res.events.find(e => e.type === 'ERROR');
            expect(errorEvent).toBeDefined();
            expect(errorEvent?.payload.code).toBe('COMBAT_LEVEL_TOO_LOW');
            expect(res.state.currentLocationId).toBe('loc_easy');
        });

        it('should allow travel if combat level is sufficient', () => {
            let state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });

            // Level up combat skills to reach level 10
            state.player.skills.swordsmanship.level = 4;
            state.player.skills.defense.level = 4;
            // Total combat skills: 4 + 4 + 1 + 1 = 10

            syncDerivedPlayerStats(state);

            const res = applyCommand(state, {
                type: 'TRAVEL',
                locationId: 'loc_combat_gate',
                atMs: 10
            }, mockContent);

            expect(res.events.find(e => e.type === 'ERROR')).toBeUndefined();
            expect(res.state.currentLocationId).toBe('loc_combat_gate');
        });
    });

    describe('Recalculation Sanity', () => {
        it('should be idempotent for skills on the current curve', () => {
            const state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });
            const skillId = 'foraging';

            // Give specific XP using the helper (New Curve 1.2)
            // Lvl 1->2 (30), 2->3 (60), 3->4 (100). Total 190.
            gainSkillXp(state, skillId, 225);
            expect(state.player.skills[skillId].level).toBe(4);
            expect(state.player.skills[skillId].xp).toBe(225); // Total XP is sacrosanct

            // Run Reset
            const res = applyCommand(state, { type: 'RESET_SKILLS', atMs: 100 }, mockContent);

            // Should remain exactly the same
            expect(res.state.player.skills[skillId].level).toBe(4);
            expect(res.state.player.skills[skillId].xp).toBe(225);
        });

        it('should correct player level if XP doesn\'t match', () => {
            // If we somehow have high XP but low level (bug state), it should fix it.
            const state = createNewState({ saveId: 't', playerId: 'p', playerName: 'n', nowMs: 0, startLocationId: 'loc_easy' });
            state.player.level = 1;
            state.player.xp = 5000; // Enough for Lvl 7 (7^2*100 = 4900)

            const res = applyCommand(state, { type: 'RESET_SKILLS', atMs: 100 }, mockContent);

            // In new system, all 10 skills start at Lv 1, so total level is 10.
            expect(res.state.player.level).toBe(10);
            expect(res.state.player.xp).toBe(0); // XP is now sum of skills (which are 0)
        });
    });
});
