import { describe, expect, it } from 'vitest';
import type { EngineState } from '@rpg-loom/shared';
import { junkStacks, sellPrice } from './market';

const content = {
    itemsById: {
        item_wood: { id: 'item_wood', name: 'Wood', type: 'resource', value: 1 },
        item_ore: { id: 'item_ore', name: 'Ore', type: 'resource', value: 4 },
        item_ash: { id: 'item_ash', name: 'Ash', type: 'resource', value: 6 },
        item_scale: { id: 'item_scale', name: 'Scale', type: 'material', value: 80 },
        item_gel: { id: 'item_gel', name: 'Gel', type: 'material', value: 10 },
        item_sword: { id: 'item_sword', name: 'Sword', type: 'weapon', value: 50 },
        item_potion: { id: 'item_potion', name: 'Potion', type: 'consumable', value: 20 },
    },
    recipesById: { recipe_ingot: { inputs: [{ itemId: 'item_ore', qty: 2 }] } },
    questTemplatesById: { qt_ash: { targetItemId: 'item_ash' } },
};

const stacks = Object.keys(content.itemsById).map(itemId => ({ itemId, qty: 3 }));

function state(quests: any[] = []): EngineState {
    return { inventory: stacks, quests } as unknown as EngineState;
}

describe('junkStacks', () => {
    it('keeps gear, potions, recipe inputs, quest targets and worthless items', () => {
        expect(junkStacks(state(), content).map(s => s.itemId)).toEqual(['item_scale', 'item_gel']);
    });

    it('keeps items an open adventure still needs', () => {
        const quests = [
            { templateId: 'dynamic_gather_item_gel', status: 'active' },
            { templateId: 'dynamic_adventure', status: 'active', adventureSteps: [
                { status: 'locked', template: { type: 'deliver', targetItemId: 'item_scale', targetLocationId: 'loc_x', qty: 1 } },
            ] },
        ];
        expect(junkStacks(state(quests), content)).toEqual([]);
    });

    it('ignores finished quests', () => {
        const quests = [{ templateId: 'dynamic_gather_item_gel', status: 'completed' }];
        expect(junkStacks(state(quests), content).map(s => s.itemId)).toEqual(['item_scale', 'item_gel']);
    });
});

describe('sellPrice', () => {
    it('pays half value, rounded down', () => {
        expect(sellPrice(content.itemsById.item_gel as any)).toBe(5);
        expect(sellPrice(content.itemsById.item_wood as any)).toBe(0);
    });
});
