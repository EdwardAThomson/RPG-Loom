import { QuestTemplateDef } from '@rpg-loom/shared';
import items from './items.json';
import enemies from './enemies.json';
import locations from './locations.json';
import recipes from './recipes.json';
import questTemplates from './quest_templates.json';

export const itemsById = Object.fromEntries(items.map(x => [x.id, x]));
export const enemiesById = Object.fromEntries(enemies.map(x => [x.id, x]));
export const locationsById = Object.fromEntries(locations.map(x => [x.id, x]));
export const recipesById = Object.fromEntries(recipes.map(x => [x.id, x]));
export const questTemplatesById = Object.fromEntries(questTemplates.map(x => [x.id, x as QuestTemplateDef]));

export function createContentIndex() {
  return {
    itemsById,
    enemiesById,
    locationsById,
    recipesById,
    questTemplatesById
  };
}

// Default export for convenience
export default {
  itemsById,
  enemiesById,
  locationsById,
  recipesById,
  questTemplatesById,
  createContentIndex
};
