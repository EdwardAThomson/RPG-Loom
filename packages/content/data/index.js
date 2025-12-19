import items from './items.json' assert { type: 'json' };
import enemies from './enemies.json' assert { type: 'json' };
import locations from './locations.json' assert { type: 'json' };
import questTemplates from './quest_templates.json' assert { type: 'json' };
import recipes from './recipes.json' assert { type: 'json' };

export { items, enemies, locations, questTemplates, recipes };

export function createContentIndex() {
  const itemsById = Object.fromEntries(items.map((x) => [x.id, x]));
  const enemiesById = Object.fromEntries(enemies.map((x) => [x.id, x]));
  const locationsById = Object.fromEntries(locations.map((x) => [x.id, x]));
  const questTemplatesById = Object.fromEntries(questTemplates.map((x) => [x.id, x]));
  const recipesById = Object.fromEntries(recipes.map((x) => [x.id, x]));
  return { itemsById, enemiesById, locationsById, questTemplatesById, recipesById };
}
