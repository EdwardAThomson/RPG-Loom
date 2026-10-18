import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@rpg-loom/shared';
import { buildFeed } from './eventFeed';

const content = {
    itemsById: { item_wood: { name: 'Wood' } },
    enemiesById: { enemy_bandit: { name: 'Bandit' } },
};

let n = 0;
const e = (atMs: number, type: string, payload: any) => ({ id: `ev_${n++}`, atMs, type, payload }) as GameEvent;

function woodTick(atMs: number): GameEvent[] {
    return [
        e(atMs, 'TICK_PROCESSED', { ticks: 1 }),
        e(atMs, 'FLAVOR_TEXT', { message: 'You chop some wood.' }),
        e(atMs, 'XP_GAINED', { amount: 1, newTotal: 1 }),
        e(atMs, 'SKILL_XP_GAINED', { skillId: 'woodcutting', amount: 1, newXp: 1, level: 1 }),
        e(atMs, 'LOOT_GAINED', { items: [{ itemId: 'item_wood', qty: 1 }] }),
    ];
}

describe('buildFeed', () => {
    it('folds a run of identical gather ticks into one entry', () => {
        const events = [1000, 2000, 3000].flatMap(woodTick);
        const feed = buildFeed(events, content);
        expect(feed).toHaveLength(1);
        expect(feed[0]).toMatchObject({
            tone: 'gain',
            text: 'Wood ×3 · +3 Woodcutting XP',
            detail: 'You chop some wood.',
            count: 3,
            atMs: 3000,
        });
    });

    it('names engine events instead of showing raw type ids', () => {
        const feed = buildFeed([
            e(1, 'ACTIVITY_SET', { activity: { type: 'hunt', locationId: 'loc_forest' } }),
            e(2, 'ENCOUNTER_STARTED', { locationId: 'loc_forest', enemyId: 'enemy_bandit', enemyLevel: 2 }),
            e(3, 'ENCOUNTER_RESOLVED', { locationId: 'loc_forest', enemyId: 'enemy_bandit', enemyLevel: 2, outcome: 'loss' }),
        ], content);
        expect(feed.map(f => f.text)).toEqual([
            'Defeated by Bandit',
            'A Bandit (Lv 2) attacks',
            'Started: hunting',
        ]);
        expect(feed[0].tone).toBe('loss');
    });

    it('keeps different gains separate and lists newest first', () => {
        const events = [
            ...woodTick(1000),
            e(2000, 'SKILL_XP_GAINED', { skillId: 'defense', amount: 1, newXp: 1, level: 1 }),
        ];
        const feed = buildFeed(events, content);
        expect(feed.map(f => f.text)).toEqual(['+1 Defense XP', 'Wood · +1 Woodcutting XP']);
    });
});
