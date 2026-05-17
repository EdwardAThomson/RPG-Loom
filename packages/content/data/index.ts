import { QuestTemplateDef, NpcDef } from '@rpg-loom/shared';
import items from './items.json';
import enemies from './enemies.json';
import locations from './locations.json';
import recipes from './recipes.json';
import questTemplates from './quest_templates.json';
import npcs from './npcs.json';

// Bump this whenever the shape of any content JSON changes in a way
// that loaded saves might depend on (renamed IDs, removed entries, new
// required fields). Saves carry their last-seen value as contentVersion.
export const CONTENT_VERSION = '2026-05-15';

export const itemsById = Object.fromEntries(items.map(x => [x.id, x]));
export const enemiesById = Object.fromEntries(enemies.map(x => [x.id, x]));
export const locationsById = Object.fromEntries(locations.map(x => [x.id, x]));
export const recipesById = Object.fromEntries(recipes.map(x => [x.id, x]));
export const questTemplatesById = Object.fromEntries(questTemplates.map(x => [x.id, x as QuestTemplateDef]));
export const npcsById = Object.fromEntries(npcs.map(x => [x.id, x as NpcDef]));

export function createContentIndex() {
  return {
    itemsById,
    enemiesById,
    locationsById,
    recipesById,
    questTemplatesById,
    npcsById
  };
}

// Default export for convenience
export default {
  CONTENT_VERSION,
  itemsById,
  enemiesById,
  locationsById,
  recipesById,
  questTemplatesById,
  npcsById,
  createContentIndex
};
