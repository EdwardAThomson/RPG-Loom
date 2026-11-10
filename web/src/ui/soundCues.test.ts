import { describe, expect, it } from 'vitest';
import type { EngineState, GameEvent } from '@rpg-loom/shared';
import { cueReady, pickSoundCue } from './soundCues';

let n = 0;
const ev = (type: string, payload: any = {}): GameEvent => ({ id: `e${n++}`, atMs: 0, type, payload } as any);
const withEncounter = (enemyHp: number, enemyId = 'enemy_wolf') =>
    ({ activeEncounter: { enemyId, enemyLevel: 1, enemyHp, enemyMaxHp: 20 } } as unknown as EngineState);

describe('pickSoundCue', () => {
    it('returns null for quiet batches', () => {
        expect(pickSoundCue([ev('TICK_PROCESSED'), ev('SKILL_XP_GAINED')])).toBeNull();
    });

    it('picks the most important cue in a batch', () => {
        const batch = [
            ev('ENCOUNTER_RESOLVED', { outcome: 'win' }),
            ev('LOOT_GAINED', { items: [] }),
            ev('GOLD_CHANGED', { amount: 3 }),
            ev('LEVEL_UP', { newLevel: 4 }),
        ];
        expect(pickSoundCue(batch)).toBe('levelUp');
        expect(pickSoundCue(batch.slice(0, 3))).toBe('victory');
    });

    it('distinguishes defeat from victory and ignores escape', () => {
        expect(pickSoundCue([ev('ENCOUNTER_RESOLVED', { outcome: 'loss' })])).toBe('defeat');
        expect(pickSoundCue([ev('ENCOUNTER_RESOLVED', { outcome: 'escape' })])).toBeNull();
    });

    it('ignores gold upkeep drains but plays for income and sales', () => {
        expect(pickSoundCue([ev('GOLD_CHANGED', { amount: -1 })])).toBeNull();
        expect(pickSoundCue([ev('GOLD_CHANGED', { amount: 5 })])).toBe('coin');
        expect(pickSoundCue([ev('ITEM_SOLD', { itemId: 'item_wood', qty: 1, gold: 1 })])).toBe('coin');
    });

    it('hears an ordinary combat round from the state diff', () => {
        expect(pickSoundCue([], withEncounter(20), withEncounter(14))).toBe('hit');
        expect(pickSoundCue([], withEncounter(20), withEncounter(20))).toBeNull();
        // A new enemy is not a hit on the old one.
        expect(pickSoundCue([], withEncounter(20), withEncounter(10, 'enemy_boar'))).toBeNull();
        // Events still outrank the hit.
        expect(pickSoundCue([ev('ENCOUNTER_STARTED')], withEncounter(20), withEncounter(14))).toBe('encounter');
    });
});

describe('cueReady', () => {
    it('throttles frequent cues but never milestone ones', () => {
        expect(cueReady('loot', 1000, {})).toBe(true);
        expect(cueReady('loot', 2000, { loot: 1000 })).toBe(false);
        expect(cueReady('loot', 5000, { loot: 1000 })).toBe(true);
        expect(cueReady('levelUp', 1001, { levelUp: 1000 })).toBe(true);
    });
});
