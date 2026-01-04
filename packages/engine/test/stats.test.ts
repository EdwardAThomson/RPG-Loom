
import { describe, it, expect } from 'vitest';
import { createNewState, step } from '../src/engine.js';
import { EngineState } from '@rpg-loom/shared';

describe('Leveling Stats', () => {
    it('should increase stats on level up', () => {
        const now = 1000;
        const state = createNewState({
            saveId: 'test',
            playerId: 'p1',
            playerName: 'Test',
            nowMs: now,
            startLocationId: 'loc1'
        });

        const initialAtk = state.player.baseStats.atk;
        const initialDef = state.player.baseStats.def;
        const initialHpMax = state.player.baseStats.hpMax;

        // Force XP gain to trigger level up (Level 1 -> 2 requires 400 XP total per formula? No, 1->2 threshold is 100*1^2? Wait.)
        // Formula: while (xp >= 100 * level^2)
        // Level 1: needs 100 * 1^2 = 100 XP to reach Level 2? 
        // If I have 0 XP. 
        // 100 XP -> Level 2? Let's check code.
        // `while (xp >= 100 * level^2)`: 100 >= 100 * 1 -> True. Level becomes 2.
        // Next check: 100 >= 100 * 2^2 (400) -> False.
        // So 100 XP is enough for Level 2.

        // Manually inject XP event/logic via step? 
        // step() doesn't expose gainXp directly. 
        // But 'train' activity does. Or we can just hack the state since we are testing engine logic internally?
        // Actually, let's use the public API if possible.
        // Or just import gainXp? It is not exported.
        // I'll simulate a 'train' tick repeatedly? Slow.
        // I will hack the state.player.xp and call step() to trigger check?
        // Wait, step() doesn't check level up unless an action causes it.
        // Implicitly, step() calls runOneTick. runOneTick -> train/craft/etc -> gainXp.
        // If I'm IDLE, no XP gain, no check.

        // I'll set activity to 'train' and give enough gold?
        // state.player.gold = 1000;
        // state.activity = { type: 'train', skillId: 'swordsmanship' };
        // This is slow (1 xp per tick).

        // Better: Export `gainXp` for testing? Or just create a unit test file that imports it?
        // Since I'm creating a new file in `packages/engine/src`, I can't import non-exported functions easily if I put it in `test/`.
        // If I put it in `src/`, it's messy.
        // Let's rely on `step` processing.
        // Actually, `step` loop calls `runOneTick`.
        // If I set state.player.xp to 9999 manually, then run 1 tick of anything (even idle?), `runOneTick`...
        // Wait, `runOneTick` does NOT check for level up generically.
        // It only calls `gainXp` when an activity awards XP.
        // So I need to trigger an XP gain event.
        // `train` is the easiest way.

        state.player.gold = 100;
        state.activity = {
            id: 'train_test',
            params: { type: 'train', skillId: 'defense' },
            startedAtMs: now
        };

        // Give almost enough XP so 1 tick pushes it over?
        state.player.xp = 99;

        // Run 1 tick
        const res = step(state, now + 1000, undefined); // No content needed for basic train logic if I ignore errors?
        // Wait, train logic:
        // gainSkillXp... gainXp(1)... 
        // It doesn't check content for training swordsmanship?
        // Checking engine.ts...
        // if (a.type === 'train') ... gainSkillXp ... gainXp ...
        // No content check. Good.

        const nextState = res.state;

        // Check Level
        expect(nextState.player.level).toBe(2);

        // Check Stats
        expect(nextState.player.baseStats.atk).toBe(initialAtk + 1);
        expect(nextState.player.baseStats.def).toBe(initialDef + 0.5);
        expect(nextState.player.baseStats.hpMax).toBe(initialHpMax + 5);
    });
});
