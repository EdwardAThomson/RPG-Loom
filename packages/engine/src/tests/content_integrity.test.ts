import { describe, it, expect } from 'vitest';
import content from '@rpg-loom/content';

/**
 * Cross-reference checks over the content pack. These fail silently at
 * runtime (a loot entry naming a missing item just produces a nameless
 * inventory stack), so the data is checked here instead.
 */
const C = content as any;
const items = Object.keys(C.itemsById) as string[];
const enemies = Object.values(C.enemiesById) as any[];
const locations = Object.values(C.locationsById) as any[];
const recipes = Object.values(C.recipesById) as any[];
const quests = Object.values(C.questTemplatesById) as any[];

const lootTables = (loc: any) =>
    (['miningTable', 'woodcuttingTable', 'foragingTable'] as const).map(k => loc[k]).filter(Boolean);

describe('Content integrity', () => {
    it('every loot table entry names a real item', () => {
        const bad: string[] = [];
        for (const e of enemies) for (const x of e.lootTable?.entries ?? []) if (!C.itemsById[x.itemId]) bad.push(`${e.id} -> ${x.itemId}`);
        for (const l of locations) for (const t of lootTables(l)) for (const x of t.entries) if (!C.itemsById[x.itemId]) bad.push(`${l.id} -> ${x.itemId}`);
        expect(bad).toEqual([]);
    });

    it('every recipe input and output names a real item', () => {
        const bad = recipes.flatMap(r => [...r.inputs, ...r.outputs].filter(x => !C.itemsById[x.itemId]).map(x => `${r.id} -> ${x.itemId}`));
        expect(bad).toEqual([]);
    });

    it('every quest target, giver, location and reward exists', () => {
        const bad: string[] = [];
        for (const q of quests) {
            if (q.targetItemId && !C.itemsById[q.targetItemId]) bad.push(`${q.id} item ${q.targetItemId}`);
            if (q.targetEnemyId && !C.enemiesById[q.targetEnemyId]) bad.push(`${q.id} enemy ${q.targetEnemyId}`);
            if (q.targetRecipeId && !C.recipesById[q.targetRecipeId]) bad.push(`${q.id} recipe ${q.targetRecipeId}`);
            if (q.questGiverNpcId && !C.npcsById[q.questGiverNpcId]) bad.push(`${q.id} npc ${q.questGiverNpcId}`);
            for (const l of q.locationPool ?? []) if (!C.locationsById[l]) bad.push(`${q.id} loc ${l}`);
            for (const x of q.rewardPack?.items ?? []) if (!C.itemsById[x.itemId]) bad.push(`${q.id} reward ${x.itemId}`);
        }
        expect(bad).toEqual([]);
    });

    it('every encounter entry names a real enemy, and every NPC a real location', () => {
        const bad: string[] = [];
        for (const l of locations) for (const x of l.encounterTable?.entries ?? []) if (!C.enemiesById[x.enemyId]) bad.push(`${l.id} -> ${x.enemyId}`);
        for (const n of Object.values(C.npcsById) as any[]) if (!C.locationsById[n.locationId]) bad.push(`${n.id} -> ${n.locationId}`);
        expect(bad).toEqual([]);
    });

    it('loot weights are positive', () => {
        const bad: string[] = [];
        for (const e of enemies) {
            for (const x of e.lootTable?.entries ?? []) if (!(x.weight > 0) || x.minQty > x.maxQty) bad.push(`${e.id} ${x.itemId}`);
            if (e.lootTable?.noDropWeight !== undefined && !(e.lootTable.noDropWeight >= 0)) bad.push(`${e.id} noDropWeight`);
        }
        expect(bad).toEqual([]);
    });

    it('tools declare the skill they boost', () => {
        for (const id of items) {
            const it = C.itemsById[id];
            if (it.type !== 'tool') continue;
            expect(it.gatherBonus, `${id} has no gatherBonus`).toBeGreaterThan(0);
            expect((it.tags ?? []).some((t: string) => ['mining', 'woodcutting', 'foraging'].includes(t)), `${id} has no gathering skill tag`).toBe(true);
        }
    });
});
