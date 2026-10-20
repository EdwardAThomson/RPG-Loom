import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@rpg-loom/shared';
import { appendFeed, buildFeed, type FeedEntry } from './eventFeed';

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

describe('appendFeed', () => {
    it('keeps counting a run across many ticks and keeps the previous activity', () => {
        let feed: FeedEntry[] = [];
        for (let t = 1; t <= 30; t++) feed = appendFeed(feed, woodTick(t * 1000), content);
        feed = appendFeed(feed, [e(31_000, 'ACTIVITY_SET', { activity: { type: 'hunt', locationId: 'loc_forest' } })], content);
        for (let t = 32; t <= 60; t++) {
            feed = appendFeed(feed, [e(t * 1000, 'SKILL_XP_GAINED', { skillId: 'defense', amount: 1, newXp: t, level: 1 })], content);
        }
        expect(feed.map(f => f.text)).toEqual([
            '+29 Defense XP',
            'Started: hunting',
            'Wood ×30 · +30 Woodcutting XP',
        ]);
    });

    it('does not mutate the feed it was given', () => {
        const before = appendFeed([], woodTick(1000), content);
        const snapshot = JSON.parse(JSON.stringify(before));
        appendFeed(before, woodTick(2000), content);
        expect(before).toEqual(snapshot);
    });

    it('caps the number of entries', () => {
        let feed: FeedEntry[] = [];
        for (let t = 1; t <= 10; t++) feed = appendFeed(feed, [e(t, 'LEVEL_UP', { newLevel: t })], content, 5);
        expect(feed).toHaveLength(5);
        expect(feed[0].text).toBe('Total level 10');
    });
});

describe('sales', () => {
    it('shows one entry per sale without a duplicate gold line', () => {
        const feed = buildFeed([
            e(5000, 'ITEM_SOLD', { itemId: 'item_wood', qty: 12, gold: 6 }),
            e(5000, 'GOLD_CHANGED', { amount: 6, newTotal: 6 }),
        ], content);
        expect(feed).toHaveLength(1);
        expect(feed[0]).toMatchObject({ tone: 'gain', text: 'Sold 12 Wood for 6 gold' });
    });
});
