import type { EngineState, ItemDef, InventoryStack } from '@rpg-loom/shared';

/** Item types that are always worth keeping: gear, potions, tools, quest items. */
const KEEP_TYPES = new Set(['weapon', 'armor', 'accessory', 'consumable', 'tool', 'quest']);

/**
 * What a merchant pays for `qty` of `item`: half value, rounded down over
 * the whole batch. Mirrors the engine's SELL_ITEM price; the engine refuses
 * a sale that would pay 0.
 */
export function sellPrice(item: ItemDef, qty = 1): number {
    return Math.floor(item.value * qty * 0.5);
}

/**
 * Item ids the player still has a use for: recipe inputs, quest-board
 * targets, and gather/deliver targets of quests that are still open.
 */
export function usefulItemIds(state: EngineState, content: any): Set<string> {
    const ids = new Set<string>();
    for (const recipe of Object.values<any>(content?.recipesById ?? {})) {
        for (const input of recipe.inputs ?? []) ids.add(input.itemId);
    }
    for (const tmpl of Object.values<any>(content?.questTemplatesById ?? {})) {
        if (tmpl.targetItemId) ids.add(tmpl.targetItemId);
    }
    for (const quest of state.quests) {
        if (quest.status === 'completed' || quest.status === 'failed' || quest.status === 'abandoned') continue;
        for (const prefix of ['dynamic_gather_', 'dynamic_deliver_']) {
            if (quest.templateId.startsWith(prefix)) ids.add(quest.templateId.slice(prefix.length));
        }
        for (const step of quest.adventureSteps ?? []) {
            if (step.status !== 'completed' && 'targetItemId' in step.template) ids.add(step.template.targetItemId);
        }
    }
    return ids;
}

/**
 * Inventory stacks that are junk: materials nothing in the game consumes,
 * and that a merchant will actually pay for.
 */
export function junkStacks(state: EngineState, content: any): InventoryStack[] {
    const useful = usefulItemIds(state, content);
    return state.inventory.filter(stack => {
        const item: ItemDef | undefined = content?.itemsById?.[stack.itemId];
        return !!item && !KEEP_TYPES.has(item.type) && !useful.has(item.id) && sellPrice(item, stack.qty) > 0;
    });
}
