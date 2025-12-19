import items from './items.json' with { type: "json" };
import enemies from './enemies.json' with { type: "json" };
import locations from './locations.json' with { type: "json" };
import recipes from './recipes.json' with { type: "json" };
import questTemplates from './quest_templates.json' with { type: "json" };

export const itemsById = Object.fromEntries(items.map(x => [x.id, x]));
export const enemiesById = Object.fromEntries(enemies.map(x => [x.id, x]));
export const locationsById = Object.fromEntries(locations.map(x => [x.id, x]));
export const recipesById = Object.fromEntries(recipes.map(x => [x.id, x]));
export const questTemplatesById = Object.fromEntries(questTemplates.map(x => [x.id, x]));

// Default export for convenience
export default {
  itemsById,
  enemiesById,
  locationsById,
  recipesById,
  questTemplatesById
};
