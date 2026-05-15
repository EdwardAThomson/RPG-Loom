import { describe, it, expect } from 'vitest';
import { getNextGoals } from '../goals.js';
import { createNewState } from '../engine.js';
import type { ContentIndex, EngineState } from '@rpg-loom/shared';

const CONTENT: ContentIndex = {
  itemsById: {
    item_wood: { id: 'item_wood', name: 'Wood', stackable: true, value: 1, tags: [], description: '', type: 'material', rarity: 'common' },
    item_plank: { id: 'item_plank', name: 'Plank', stackable: true, value: 3, tags: [], description: '', type: 'material', rarity: 'common' },
    item_iron: { id: 'item_iron', name: 'Iron Ingot', stackable: true, value: 8, tags: [], description: '', type: 'material', rarity: 'uncommon' }
  } as any,
  enemiesById: {} as any,
  locationsById: {
    loc_forest: {
      id: 'loc_forest', name: 'Forest', description: '',
      activities: ['hunt'], encounterTable: { entries: [] }
    },
    loc_quarry: {
      id: 'loc_quarry', name: 'Quarry', description: '',
      requirements: { minLevel: 4 },
      activities: ['mine'], encounterTable: { entries: [] }
    },
    loc_keep: {
      id: 'loc_keep', name: 'Iron Keep', description: '',
      requirements: { minLevel: 20, minAtk: 30 },
      activities: ['hunt'], encounterTable: { entries: [] }
    },
    loc_world_end: {
      id: 'loc_world_end', name: 'The World\'s End', description: '',
      requirements: { minLevel: 200 },
      activities: ['hunt'], encounterTable: { entries: [] }
    }
  } as any,
  recipesById: {
    recipe_plank: {
      id: 'recipe_plank', name: 'Plank', skill: 'woodworking', requiredSkillLevel: 1,
      inputs: [{ itemId: 'item_wood', qty: 2 }], outputs: [{ itemId: 'item_plank', qty: 1 }]
    },
    recipe_iron: {
      id: 'recipe_iron', name: 'Iron Ingot', skill: 'blacksmithing', requiredSkillLevel: 5,
      inputs: [], outputs: []
    },
    recipe_steel: {
      id: 'recipe_steel', name: 'Steel Ingot', skill: 'blacksmithing', requiredSkillLevel: 50,
      inputs: [], outputs: []
    }
  } as any,
  questTemplatesById: {
    tmpl_easy: {
      id: 'tmpl_easy', name: 'Pest Patrol', objectiveType: 'kill',
      targetEnemyId: 'enemy_rat', qtyMin: 5, qtyMax: 5,
      locationPool: ['loc_forest'],
      rewardPack: { xp: 10, gold: 5 }, difficulty: 1
    }
  } as any
};

function freshState(): EngineState {
  return createNewState({
    saveId: 'test', playerId: 'p', playerName: 'Hero',
    nowMs: 0, startLocationId: 'loc_forest'
  });
}

describe('getNextGoals', () => {
  it('surfaces a recipe-unlock goal when the player is within skill lookahead', () => {
    const state = freshState();
    // Player is level 1 in blacksmithing; recipe_iron needs level 5 (delta 4, within lookahead).
    const goals = getNextGoals(state, CONTENT, 5);

    const recipeGoal = goals.find(g => g.category === 'recipe' && g.actionHint?.recipeId === 'recipe_iron');
    expect(recipeGoal).toBeDefined();
    expect(recipeGoal!.progress).toEqual({ current: 1, required: 5 });
    expect(recipeGoal!.actionHint?.tab).toBe('crafting');
  });

  it('omits recipes the player has already unlocked', () => {
    const state = freshState();
    state.player.skills.woodworking.level = 5;
    const goals = getNextGoals(state, CONTENT, 10);

    const plankGoal = goals.find(g => g.actionHint?.recipeId === 'recipe_plank');
    expect(plankGoal).toBeUndefined();
  });

  it('omits recipes whose skill gap exceeds the lookahead', () => {
    const state = freshState();
    // recipe_steel needs blacksmithing 50; player is 1 → delta 49, way past lookahead.
    const goals = getNextGoals(state, CONTENT, 10);

    const steelGoal = goals.find(g => g.actionHint?.recipeId === 'recipe_steel');
    expect(steelGoal).toBeUndefined();
  });

  it('surfaces a location-unlock goal for a nearby level gate', () => {
    const state = freshState();
    state.player.level = 1;
    // loc_quarry needs level 4; delta 3 is within LOCATION_LEVEL_LOOKAHEAD=5.
    const goals = getNextGoals(state, CONTENT, 10);

    const quarryGoal = goals.find(g => g.actionHint?.locationId === 'loc_quarry');
    expect(quarryGoal).toBeDefined();
    expect(quarryGoal!.actionHint?.tab).toBe('travel');
    expect(quarryGoal!.label).toContain('Quarry');
  });

  it('omits locations gated by faraway requirements', () => {
    const state = freshState();
    state.player.level = 1;
    // loc_world_end is gated at level 200 — way past lookahead.
    const goals = getNextGoals(state, CONTENT, 10);

    const worldEnd = goals.find(g => g.actionHint?.locationId === 'loc_world_end');
    expect(worldEnd).toBeUndefined();
  });

  it('picks the closest unmet gate when a location has multiple requirements', () => {
    const state = freshState();
    state.player.level = 18; // 18/20 = 0.9 fraction
    state.player.baseStats.atk = 25; // 25/30 = 0.83 fraction
    const goals = getNextGoals(state, CONTENT, 10);

    const keepGoal = goals.find(g => g.actionHint?.locationId === 'loc_keep');
    expect(keepGoal).toBeDefined();
    // Closer gate is Level 18/20 (fraction 0.9 > 0.83).
    expect(keepGoal!.label).toContain('Level');
    expect(keepGoal!.progress).toEqual({ current: 18, required: 20 });
  });

  it('ranks active quests above unrelated unlocks even when far from done', () => {
    const state = freshState();
    state.quests.push({
      id: 'q_test',
      templateId: 'tmpl_easy',
      status: 'active',
      progress: { current: 0, required: 10 },
      locationId: 'loc_forest',
      createdAtMs: 0
    });

    const goals = getNextGoals(state, CONTENT, 3);
    // The freshly-accepted quest is at 0/10 (fraction 0) but should still
    // rank above recipe_plank (0/1 → fraction 0 but no boost) and
    // recipe_iron (1/5 → 0.2).
    expect(goals[0].category).toBe('quest');
    expect(goals[0].actionHint?.questId).toBe('q_test');
  });

  it('uses the quest template name when no AI narrative title is set', () => {
    const state = freshState();
    state.quests.push({
      id: 'q_test',
      templateId: 'tmpl_easy',
      status: 'active',
      progress: { current: 2, required: 5 },
      locationId: 'loc_forest',
      createdAtMs: 0
    });

    const goals = getNextGoals(state, CONTENT, 3);
    const questGoal = goals.find(g => g.category === 'quest');
    expect(questGoal!.label).toBe('Pest Patrol');
  });

  it('respects the limit parameter', () => {
    const state = freshState();
    const goals = getNextGoals(state, CONTENT, 1);
    expect(goals.length).toBeLessThanOrEqual(1);
  });

  it('returns an empty list when there is nothing reasonable to surface', () => {
    const state = freshState();
    // Crank every relevant skill and stat past every gate in CONTENT.
    state.player.level = 999;
    state.player.combatLevel = 999;
    state.player.baseStats.atk = 999;
    state.player.baseStats.def = 999;
    for (const id of Object.keys(state.player.skills)) {
      (state.player.skills as any)[id].level = 99;
    }
    const goals = getNextGoals(state, CONTENT, 5);
    expect(goals).toEqual([]);
  });

  it('does not include the current location as a goal', () => {
    const state = freshState();
    state.currentLocationId = 'loc_quarry';
    state.player.level = 1; // would otherwise gate Quarry
    const goals = getNextGoals(state, CONTENT, 10);
    expect(goals.find(g => g.actionHint?.locationId === 'loc_quarry')).toBeUndefined();
  });
});
