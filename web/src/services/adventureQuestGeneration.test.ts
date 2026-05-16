import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAdventureSpec } from './adventureQuestGeneration';
import type { ContentIndex } from '@rpg-loom/shared';

const CONTENT: ContentIndex = {
    itemsById: {
        item_wood: { id: 'item_wood', name: 'Wood', type: 'material', rarity: 'common', description: '', stackable: true, value: 1 },
        item_iron: { id: 'item_iron', name: 'Iron Ingot', type: 'material', rarity: 'uncommon', description: '', stackable: true, value: 8 }
    },
    enemiesById: {
        enemy_rat: {
            id: 'enemy_rat', name: 'Rat', tags: [], levelMin: 1, levelMax: 3,
            baseStats: { hp: 5, hpMax: 5, atk: 1, def: 0, spd: 1, critChance: 0, critMult: 1, res: 0 },
            lootTable: { entries: [] }
        },
        enemy_bandit: {
            id: 'enemy_bandit', name: 'Bandit', tags: [], levelMin: 5, levelMax: 10,
            baseStats: { hp: 20, hpMax: 20, atk: 4, def: 2, spd: 3, critChance: 0, critMult: 1, res: 0 },
            lootTable: { entries: [] }
        }
    },
    locationsById: {
        loc_haven: {
            id: 'loc_haven', name: 'Haven', description: '', activities: [],
            encounterTable: { entries: [] }
        },
        loc_forest: {
            id: 'loc_forest', name: 'Forest', description: '', activities: ['hunt'],
            encounterTable: { entries: [] }
        },
        loc_keep: {
            id: 'loc_keep', name: 'Iron Keep', description: '', activities: ['hunt'],
            requirements: { minLevel: 10 },
            encounterTable: { entries: [] }
        }
    },
    recipesById: {
        recipe_plank: {
            id: 'recipe_plank', name: 'Plank', skill: 'woodworking', requiredSkillLevel: 1,
            inputs: [{ itemId: 'item_wood', qty: 2 }], outputs: [{ itemId: 'item_wood', qty: 1 }]
        }
    },
    questTemplatesById: {}
};

beforeEach(() => {
    // Suppress the deliberate console.warn / console.error from the
    // validator while still catching test failures.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('parseAdventureSpec: ID validation', () => {
    it('accepts a spec with every ID known to the content pack', () => {
        const text = JSON.stringify({
            title: 'Test',
            description: 'd',
            difficulty: 3,
            steps: [
                { stepNumber: 1, template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 3 }, narrative: { description: 'kill rats' } },
                { stepNumber: 2, template: { type: 'travel', targetLocationId: 'loc_haven' }, narrative: { description: 'return' } }
            ],
            rewards: { xp: 100, gold: 50 }
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.title).toBe('Test');
        expect(spec.steps).toHaveLength(2);
        expect(spec.steps[0].template.type).toBe('kill');
    });

    it('drops a step whose enemyId does not exist in content', () => {
        const text = JSON.stringify({
            title: 'Test',
            description: 'd',
            steps: [
                { stepNumber: 1, template: { type: 'kill', targetEnemyId: 'enemy_dragon', qty: 1 }, narrative: { description: 'kill the dragon' } },
                { stepNumber: 2, template: { type: 'travel', targetLocationId: 'loc_haven' }, narrative: { description: 'go home' } }
            ],
            rewards: { xp: 100, gold: 50 }
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.steps).toHaveLength(1);
        expect(spec.steps[0].template.type).toBe('travel');
    });

    it('drops a step whose locationId is invented', () => {
        const text = JSON.stringify({
            steps: [
                { template: { type: 'explore', targetLocationId: 'loc_nowhere', durationMs: 30000 }, narrative: { description: 'wander' } },
                { template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 2 }, narrative: { description: 'rats' } }
            ],
            rewards: { xp: 100, gold: 50 }
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.steps).toHaveLength(1);
        expect(spec.steps[0].template).toMatchObject({ type: 'kill', targetEnemyId: 'enemy_rat' });
    });

    it('drops a craft step whose recipeId is invented', () => {
        const text = JSON.stringify({
            steps: [
                { template: { type: 'craft', targetRecipeId: 'recipe_dragonsteel', qty: 1 }, narrative: { description: 'craft' } }
            ]
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        // No valid steps → fallback (built from content, has at least one step).
        expect(spec.steps.length).toBeGreaterThan(0);
        for (const step of spec.steps) {
            // Every fallback step's template should reference a real ID.
            if (step.template.type === 'kill') expect(CONTENT.enemiesById[step.template.targetEnemyId]).toBeDefined();
            if (step.template.type === 'travel' || step.template.type === 'explore') {
                expect(CONTENT.locationsById[step.template.targetLocationId]).toBeDefined();
            }
        }
    });

    it('validates deliver steps require BOTH item and location', () => {
        const text = JSON.stringify({
            steps: [
                { template: { type: 'deliver', targetItemId: 'item_iron', targetLocationId: 'loc_nowhere', qty: 1 }, narrative: { description: 'deliver' } },
                { template: { type: 'deliver', targetItemId: 'item_nowhere', targetLocationId: 'loc_haven', qty: 1 }, narrative: { description: 'deliver' } },
                { template: { type: 'deliver', targetItemId: 'item_iron', targetLocationId: 'loc_haven', qty: 2 }, narrative: { description: 'deliver' } }
            ]
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.steps).toHaveLength(1);
        expect(spec.steps[0].template).toMatchObject({
            type: 'deliver',
            targetItemId: 'item_iron',
            targetLocationId: 'loc_haven',
            qty: 2
        });
    });

    it('falls back to a content-derived adventure when JSON parsing fails', () => {
        const spec = parseAdventureSpec('not json {[}', 10, CONTENT);
        expect(spec.title).toBe('A Simple Quest');
        expect(spec.steps.length).toBeGreaterThan(0);
        // Fallback IDs must exist in content.
        for (const step of spec.steps) {
            if (step.template.type === 'explore' || step.template.type === 'travel') {
                expect(CONTENT.locationsById[step.template.targetLocationId]).toBeDefined();
            }
            if (step.template.type === 'kill') {
                expect(CONTENT.enemiesById[step.template.targetEnemyId]).toBeDefined();
            }
        }
    });

    it('strips reward items whose itemId is invented', () => {
        const text = JSON.stringify({
            steps: [
                { template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 1 }, narrative: { description: 'rats' } }
            ],
            rewards: {
                xp: 100,
                gold: 50,
                items: [
                    { itemId: 'item_iron', qty: 2 },
                    { itemId: 'item_dragonscale', qty: 1 }
                ]
            }
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.rewards.items).toEqual([{ itemId: 'item_iron', qty: 2 }]);
    });

    it('rejects a step with non-positive qty', () => {
        const text = JSON.stringify({
            steps: [
                { template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 0 }, narrative: { description: 'zero rats' } },
                { template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 3 }, narrative: { description: 'three rats' } }
            ]
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.steps).toHaveLength(1);
        expect(spec.steps[0].template).toMatchObject({ type: 'kill', qty: 3 });
    });

    it('falls back when every step is invalid', () => {
        const text = JSON.stringify({
            steps: [
                { template: { type: 'kill', targetEnemyId: 'enemy_dragon', qty: 1 }, narrative: { description: 'd' } },
                { template: { type: 'travel', targetLocationId: 'loc_nowhere' }, narrative: { description: 'd' } }
            ]
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.title).toBe('A Simple Quest');
        expect(spec.steps.length).toBeGreaterThan(0);
    });

    it('strips ```json fences from the AI response', () => {
        const wrapped = '```json\n' + JSON.stringify({
            steps: [{ template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 2 }, narrative: { description: 'rats' } }]
        }) + '\n```';
        const spec = parseAdventureSpec(wrapped, 10, CONTENT);
        expect(spec.steps).toHaveLength(1);
    });

    it('renumbers steps so the surviving order is 1..N', () => {
        const text = JSON.stringify({
            steps: [
                { stepNumber: 1, template: { type: 'kill', targetEnemyId: 'enemy_dragon', qty: 1 }, narrative: { description: 'invalid' } },
                { stepNumber: 2, template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 1 }, narrative: { description: 'rats' } },
                { stepNumber: 3, template: { type: 'kill', targetEnemyId: 'enemy_bandit', qty: 1 }, narrative: { description: 'bandits' } }
            ]
        });
        const spec = parseAdventureSpec(text, 10, CONTENT);
        expect(spec.steps.map(s => s.stepNumber)).toEqual([1, 2]);
    });
});
