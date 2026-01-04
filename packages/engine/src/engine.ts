import type {
  ActivityParams,
  EngineState,
  GameEvent,
  InventoryStack,
  ItemId,
  LootTable,
  PlayerCommand,
  QuestInstanceState,
  QuestTemplateDef,
  RewardPack,
  ContentIndex,
  SkillId
} from '@rpg-loom/shared';

export type {
  ActivityParams,
  EngineState,
  GameEvent,
  InventoryStack,
  ItemId,
  LootTable,
  PlayerCommand,
  QuestInstanceState,
  QuestTemplateDef,
  RewardPack,
  SkillId
};

import { hashFloat, hashInt } from './rng.js';

// ---- Content Index (data pack) ----
// ---- Content Index (data pack) ----
// Imported from @rpg-loom/shared


export interface EngineConfig {
  tickMs: number; // simulation tick duration
}

export interface StepResult {
  state: EngineState;
  events: GameEvent[];
}

const DEFAULT_CONFIG: EngineConfig = { tickMs: 1000 };

// ---- Public API ----
export function createNewState(params: {
  saveId: string;
  playerId: string;
  playerName: string;
  nowMs: number;
  startLocationId: string;
}): EngineState {
  return {
    version: 1,
    saveId: params.saveId,
    createdAtMs: params.nowMs,
    updatedAtMs: params.nowMs,
    tickIndex: 0,
    lastTickAtMs: params.nowMs,
    nextEventId: 0,
    currentLocationId: params.startLocationId,
    player: {
      id: params.playerId,
      name: params.playerName,
      level: 1,
      xp: 0,
      gold: 0,
      tactics: 'balanced',
      baseStats: {
        hp: 25,
        hpMax: 25,
        atk: 5,
        def: 3,
        spd: 5,
        critChance: 0.05,
        critMult: 1.5,
        res: 0.05
      },
      intrinsicStats: {
        hp: 25,
        hpMax: 25,
        atk: 5,
        def: 3,
        spd: 5,
        critChance: 0.05,
        critMult: 1.5,
        res: 0.05
      },
      skills: {
        swordsmanship: { id: 'swordsmanship', level: 1, xp: 0 },
        marksmanship: { id: 'marksmanship', level: 1, xp: 0 },
        arcana: { id: 'arcana', level: 1, xp: 0 },
        defense: { id: 'defense', level: 1, xp: 0 },
        mining: { id: 'mining', level: 1, xp: 0 },
        woodcutting: { id: 'woodcutting', level: 1, xp: 0 },
        foraging: { id: 'foraging', level: 1, xp: 0 },
        blacksmithing: { id: 'blacksmithing', level: 1, xp: 0 },
        woodworking: { id: 'woodworking', level: 1, xp: 0 },
        leatherworking: { id: 'leatherworking', level: 1, xp: 0 },
        tailoring: { id: 'tailoring', level: 1, xp: 0 },
      },
      reputation: {},
      flags: {}
    },
    inventory: [],
    equipment: {},
    quests: [],
    activity: {
      id: 'act_idle_0',
      params: { type: 'idle' },
      startedAtMs: params.nowMs

    },
    metrics: {
      startTimeMs: params.nowMs,
      startXp: 0,
      startGold: 0
    }
  };
}

export function applyCommand(state: EngineState, cmd: PlayerCommand, content?: ContentIndex): StepResult {
  const events: GameEvent[] = [];
  const next = clone(state);

  switch (cmd.type) {
    case 'DEBUG_ADD_ITEM': {
      next.inventory.push({ itemId: cmd.itemId, qty: cmd.qty });
      events.push(ev(next, cmd.atMs, 'LOOT_GAINED', { items: [{ itemId: cmd.itemId, qty: cmd.qty }] }));
      break;
    }
    case 'SET_ACTIVITY': {
      next.activity = {
        id: `act_${cmd.params.type}_${next.tickIndex}`,
        params: cmd.params,
        startedAtMs: cmd.atMs
      };
      // update location if activity carries one
      if ('locationId' in cmd.params && cmd.params.locationId) {
        next.currentLocationId = cmd.params.locationId;
        // Clear active encounter when switching activity (e.g. running away)
        delete next.activeEncounter;
      } else if (cmd.params.type === 'idle' || cmd.params.type === 'train' || cmd.params.type === 'craft' || cmd.params.type === 'recovery') {
        // switching to non-combat activity should clear encounter too
        delete next.activeEncounter;
      }

      events.push(ev(next, cmd.atMs, 'ACTIVITY_SET', { activity: cmd.params }));
      break;
    }
    case 'ACCEPT_QUEST': {
      const tmpl = content?.questTemplatesById?.[cmd.templateId];
      if (!tmpl) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'QUEST_TEMPLATE_MISSING', message: `Unknown quest template ${cmd.templateId}` }));
        break;
      }
      const locationId = cmd.locationId ?? tmpl.locationPool[0];
      const required = randIntDet(`questqty:${next.saveId}:${cmd.templateId}:${next.tickIndex}`, tmpl.qtyMin, tmpl.qtyMax);
      const quest: QuestInstanceState = {
        id: `q_${cmd.templateId}_${next.tickIndex}`,
        templateId: cmd.templateId,
        status: 'active',
        progress: { current: 0, required },
        locationId,
        npcId: cmd.npcId,
        createdAtMs: cmd.atMs
      };
      next.quests.push(quest);
      events.push(
        ev(next, cmd.atMs, 'QUEST_ACCEPTED', {
          questId: quest.id,
          templateId: cmd.templateId,
          locationId,
          npcId: cmd.npcId
        })
      );
      break;
    }
    case 'ABANDON_QUEST': {
      const q = next.quests.find((x) => x.id === cmd.questId);
      if (q && q.status === 'active') {
        q.status = 'abandoned';
      }
      break;
    }
    case 'EQUIP_ITEM': {
      // NOTE: no item type checks yet; enforce later via content definitions.
      if (!hasItem(next.inventory, cmd.itemId, 1)) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'ITEM_NOT_OWNED', message: `Item not in inventory: ${cmd.itemId}` }));
        break;
      }
      (next.equipment as any)[cmd.slot] = cmd.itemId;
      if (content) recalculateStats(next, content);
      break;
    }
    case 'UNEQUIP_ITEM': {
      (next.equipment as any)[cmd.slot] = undefined;
      if (content) recalculateStats(next, content);
      break;
    }
    case 'USE_ITEM': {
      if (!hasItem(next.inventory, cmd.itemId, 1)) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'ITEM_NOT_OWNED', message: `Item not in inventory: ${cmd.itemId}` }));
        break;
      }
      removeItem(next.inventory, cmd.itemId, 1);
      events.push(ev(next, cmd.atMs, 'ITEM_CONSUMED', { itemId: cmd.itemId }));
      // Actual effects are interpreted via content later.
      break;
    }
    case 'SET_TACTICS': {
      next.player.tactics = cmd.tactics;
      events.push(ev(next, cmd.atMs, 'TACTICS_CHANGED', { tactics: cmd.tactics }));
      break;
    }
    case 'RESET_METRICS': {
      next.metrics = {
        startTimeMs: cmd.atMs,
        startXp: next.player.xp,
        startGold: next.player.gold
      };
      break;
    }
    case 'TRAVEL': {
      if (!content || !content.locationsById[cmd.locationId]) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'LOCATION_MISSING', message: `Unknown location ${cmd.locationId}` }));
        break;
      }

      const loc = content.locationsById[cmd.locationId];
      // Check requirements
      if (loc.requirements?.minLevel && next.player.level < loc.requirements.minLevel) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'LEVEL_TOO_LOW', message: `Level ${loc.requirements.minLevel} required.` }));
        break;
      }

      next.currentLocationId = cmd.locationId;
      // Stop current activity and idle at new location
      next.activity = {
        id: `act_idle_${next.tickIndex}`,
        params: { type: 'idle' },
        startedAtMs: cmd.atMs
      };
      delete next.activeEncounter;

      events.push(ev(next, cmd.atMs, 'ACTIVITY_SET', { activity: { type: 'idle' } }));
      break;
    }
    case 'BUY_ITEM': {
      if (!content) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
        break;
      }
      const item = content.itemsById[cmd.itemId];
      if (!item) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'ITEM_MISSING', message: `Unknown item ${cmd.itemId}` }));
        break;
      }
      const cost = item.value * cmd.qty;
      if (next.player.gold < cost) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'INSUFFICIENT_GOLD', message: `Need ${cost} gold` }));
        break;
      }

      next.player.gold -= cost;
      addItem(next.inventory, cmd.itemId, cmd.qty);
      events.push(ev(next, cmd.atMs, 'GOLD_CHANGED', { amount: -cost, newTotal: next.player.gold }));
      events.push(ev(next, cmd.atMs, 'LOOT_GAINED', { items: [{ itemId: cmd.itemId, qty: cmd.qty }] }));
      break;
    }
    case 'SELL_ITEM': {
      if (!content) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
        break;
      }
      const item = content.itemsById[cmd.itemId];
      if (!item) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'ITEM_MISSING', message: `Unknown item ${cmd.itemId}` }));
        break;
      }
      if (!hasItem(next.inventory, cmd.itemId, cmd.qty)) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'ITEM_NOT_OWNED', message: `Not enough ${item.name}` }));
        break;
      }

      // Sell for 50% value
      const val = Math.floor(item.value * 0.5) * cmd.qty;
      removeItem(next.inventory, cmd.itemId, cmd.qty);
      next.player.gold += val;
      events.push(ev(next, cmd.atMs, 'ITEM_CONSUMED', { itemId: cmd.itemId }));
      events.push(ev(next, cmd.atMs, 'GOLD_CHANGED', { amount: val, newTotal: next.player.gold }));
      break;
    }
  }

  next.updatedAtMs = cmd.atMs;
  return { state: next, events };
}

export function step(state: EngineState, nowMs: number, content?: ContentIndex, config: Partial<EngineConfig> = {}): StepResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const events: GameEvent[] = [];

  if (nowMs <= state.lastTickAtMs) {
    return { state, events };
  }

  const ticksToRun = Math.floor((nowMs - state.lastTickAtMs) / cfg.tickMs);
  if (ticksToRun <= 0) {
    return { state, events };
  }

  let next = clone(state);

  for (let i = 0; i < ticksToRun; i++) {
    const tickAtMs = next.lastTickAtMs + cfg.tickMs;
    const tickEvents = runOneTick(next, tickAtMs, content);
    next = tickEvents.state;
    events.push(...tickEvents.events);
  }

  events.push(ev(next, next.lastTickAtMs, 'TICK_PROCESSED', { ticks: ticksToRun }));
  return { state: next, events };
}

export function simulateOffline(state: EngineState, fromMs: number, toMs: number, content?: ContentIndex, config: Partial<EngineConfig> = {}): StepResult {
  // Identical to step(), but explicit bounds.
  const clampedFrom = Math.max(fromMs, state.lastTickAtMs);
  const clampedTo = Math.max(toMs, clampedFrom);
  return step({ ...state, lastTickAtMs: clampedFrom }, clampedTo, content, config);
}

// ---- Tick resolution ----
function runOneTick(state: EngineState, tickAtMs: number, content?: ContentIndex): StepResult {
  const next = clone(state);
  const events: GameEvent[] = [];

  next.tickIndex += 1;
  next.lastTickAtMs = tickAtMs;
  next.updatedAtMs = tickAtMs;

  const a = next.activity.params;

  // Regen Logic
  const maxHp = next.player.baseStats.hpMax;
  if (next.player.baseStats.hp < maxHp) {
    const isRecovery = a.type === 'recovery';
    // 10% per tick if recovering, 1% if idle/other (slow base regen)
    const regenPct = isRecovery ? 0.10 : 0.01;
    const amount = Math.max(1, Math.floor(maxHp * regenPct));

    // const oldHp = next.player.baseStats.hp;
    next.player.baseStats.hp = Math.min(maxHp, next.player.baseStats.hp + amount);

    // Optional: Event for healing? Might be spammy.
    // if (isRecovery) events.push(ev(next, tickAtMs, 'HEAL', { amount }));
  }

  // minimal deterministic per-tick outputs
  if (a.type === 'idle') return { state: next, events };

  if (a.type === 'recovery') {
    // Check if recovery is done
    if (tickAtMs >= next.activity.startedAtMs + a.durationMs) {
      next.activity = {
        id: `act_idle_${next.tickIndex}`,
        params: { type: 'idle' },
        startedAtMs: tickAtMs
      };
      events.push(ev(next, tickAtMs, 'ACTIVITY_SET', { activity: { type: 'idle' } }));
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'RECOVERY_COMPLETE', message: 'You have recovered.' })); // Using ERROR as a generic notification for now? No, let's just log activity set.
    }
    return { state: next, events };
  }

  if (a.type === 'train') {
    // Training Cost: 1 gold/tick
    if (next.player.gold < 1) {
      next.activity = {
        id: `act_idle_${next.tickIndex}`,
        params: { type: 'idle' },
        startedAtMs: tickAtMs
      };
      events.push(ev(next, tickAtMs, 'ACTIVITY_SET', { activity: { type: 'idle' } }));
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'INSUFFICIENT_GOLD', message: 'Not enough gold to continue training.' }));
      return { state: next, events };
    }

    next.player.gold -= 1;
    // Debatable: emit GOLD_CHANGED every tick? It might be spammy, but it's correct.
    events.push(ev(next, tickAtMs, 'GOLD_CHANGED', { amount: -1, newTotal: next.player.gold }));

    gainSkillXp(next, a.skillId, 1);
    gainXp(next, 1, events, tickAtMs);
    return { state: next, events };
  }
  if (a.type === 'woodcut') {
    // Debug logs removed

    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content' }));
      return { state: next, events };
    }
    const loc = content.locationsById[a.locationId];
    if (!loc) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOC_MISSING', message: `No loc ${a.locationId}` }));
      return { state: next, events };
    }
    if (!loc.woodcuttingTable) {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `There are no trees here.` }));
    } else {
      const loot = rollLoot(loc.woodcuttingTable, `wc:${next.saveId}:${next.tickIndex}`);
      if (loot.length) {
        // Emit Flavor FIRST so Loot and XP can merge on the next line
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You chop some wood.` }));

        for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
        events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));

        // XP
        gainSkillXp(next, 'woodcutting', 1);
        gainXp(next, 1, events, tickAtMs);
      } else {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You chop, but get no good wood.` }));
      }
    }
    return { state: next, events };
  }

  if (a.type === 'mine') {
    // Debug logs removed

    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content' }));
      return { state: next, events };
    }
    const loc = content.locationsById[a.locationId];
    if (!loc) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOC_MISSING', message: `No loc ${a.locationId}` }));
      return { state: next, events };
    }
    if (!loc.miningTable) {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `There are no ore veins here.` }));
    } else {
      const loot = rollLoot(loc.miningTable, `mine:${next.saveId}:${next.tickIndex}`);
      if (loot.length) {
        // Flavor First
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You swing your pickaxe.` }));

        for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
        events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));

        // XP
        gainSkillXp(next, 'mining', 1);
        gainXp(next, 1, events, tickAtMs);
      } else {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You swing your pickaxe but find nothing.` }));
      }
    }
    return { state: next, events };
  }

  if (a.type === 'forage') {
    // Debug logs removed

    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content' }));
      return { state: next, events };
    }
    const loc = content.locationsById[a.locationId];
    if (!loc) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOC_MISSING', message: `No loc ${a.locationId}` }));
      return { state: next, events };
    }
    if (!loc.foragingTable) {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `There is nothing to forage here.` }));
    } else {
      const loot = rollLoot(loc.foragingTable, `forage:${next.saveId}:${next.tickIndex}`);
      if (loot.length) {
        // Flavor First
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You scour the area.` }));

        for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
        events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));

        // XP
        gainSkillXp(next, 'foraging', 1);
        gainXp(next, 1, events, tickAtMs);
      } else {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You find nothing of interest.` }));
      }
    }
    return { state: next, events };
  }

  if (a.type === 'explore' || a.type === 'trade') {
    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
      return { state: next, events };
    }
    const loc = content.locationsById[a.locationId];
    if (!loc) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOCATION_MISSING', message: `Unknown location ${a.locationId}` }));
      return { state: next, events };
    }

    let lootTable: LootTable | undefined;
    let skillId: SkillId | undefined;

    // No loot tables for explore/trade in MVP, but keeping structure for future.
    // if (a.type === 'explore') {
    //   lootTable = loc.exploreTable;
    //   skillId = 'exploration';
    // } else if (a.type === 'trade') {
    //   lootTable = loc.tradeTable;
    //   skillId = 'commerce';
    // }

    if (lootTable) {
      let verb = 'look for resources';
      if (a.type === 'explore') verb = 'explore the area';
      else if (a.type === 'trade') verb = 'look for trade opportunities';

      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You ${verb}.` }));

      const loot = rollLoot(lootTable, `gather:${next.saveId}:${a.locationId}:${next.tickIndex}`);

      if (loot.length) {
        if (skillId) {
          const skillLevel = next.player.skills[skillId].level;
          const doubleChance = Math.min(0.5, skillLevel * 0.01);
          if (hashFloat(`dbl:${next.saveId}:${next.tickIndex}`) < doubleChance) {
            for (const it of loot) it.qty *= 2;
            events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: "Critical gathering success! (x2)" }));
          }
          gainSkillXp(next, skillId, 1);
        }

        for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
        events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
        gainXp(next, 1, events, tickAtMs);
        bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
      }
    } else {
      // For now, just flavor text for explore/trade if no loot table
      if (a.type === 'explore') {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You explore the area.` }));
      } else if (a.type === 'trade') {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You look for trade opportunities.` }));
      }
      gainXp(next, 1, events, tickAtMs); // Still gain XP for the activity
    }
    return { state: next, events };
  }

  if (a.type === 'craft') {
    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
      return { state: next, events };
    }
    const recipeId = a.recipeId;
    const recipe = content.recipesById[recipeId];
    if (!recipe) {
      // Stop invalid craft
      next.activity = { id: `act_idle_${next.tickIndex}`, params: { type: 'idle' }, startedAtMs: tickAtMs };
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'RECIPE_MISSING', message: `Unknown recipe ${recipeId}` }));
      return { state: next, events };
    }

    if (!recipe.inputs.every((i) => hasItem(next.inventory, i.itemId, i.qty))) {
      // can't craft; stop
      next.activity = { id: `act_idle_${next.tickIndex}`, params: { type: 'idle' }, startedAtMs: tickAtMs };
      return { state: next, events };
    }

    // Material Saving Check
    // Determine skill to use
    const skillId = recipe.skill || 'crafting'; // Fallback if old data
    const skill = next.player.skills[skillId];
    // If skill doesn't exist (e.g. 'crafting' removed), handle gracefully? 
    // Types should prevent this now, but let's be safe.
    const skillLevel = skill ? skill.level : 1;

    // Check level requirement
    if (recipe.requiredSkillLevel && skillLevel < recipe.requiredSkillLevel) {
      next.activity = { id: `act_idle_${next.tickIndex}`, params: { type: 'idle' }, startedAtMs: tickAtMs };
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'LEVEL_TOO_LOW', message: `Need ${recipe.skill} Lv.${recipe.requiredSkillLevel}` }));
      return { state: next, events };
    }

    const saveChance = Math.min(0.25, skillLevel * 0.005); // 0.5% per level, cap 25%
    const materialsSaved = hashFloat(`save:${next.saveId}:${next.tickIndex}`) < saveChance;

    if (!materialsSaved) {
      for (const i of recipe.inputs) removeItem(next.inventory, i.itemId, i.qty);
    } else {
      events.push(ev(next, tickAtMs, 'SKILL_PROCS', { skillId, effect: 'material_save' } as any));
    }

    for (const o of recipe.outputs) addItem(next.inventory, o.itemId, o.qty);
    events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: recipe.outputs.map((o) => ({ itemId: o.itemId, qty: o.qty })) }));

    // XP
    // 10 XP base + scaled?
    const xpGain = Math.max(10, (recipe.requiredSkillLevel || 1) * 10);
    gainXp(next, 5, events, tickAtMs); // Player XP
    if (skillId && skill) gainSkillXp(next, skillId, xpGain);

    bumpQuestProgressFromCraft(next, a.recipeId, events, tickAtMs, content);
    return { state: next, events };
  }

  if (a.type === 'hunt') {
    return resolveEncounterTick(next, tickAtMs, a.locationId, content);
  }

  if (a.type === 'quest') {
    // Quest activity runs its template intent (MVP: hunt or gather depending on template)
    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
      return { state: next, events };
    }
    const q = next.quests.find((x) => x.id === a.questId);
    if (!q || q.status !== 'active') return { state: next, events };

    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'QUEST_TEMPLATE_MISSING', message: `Unknown quest template ${q.templateId}` }));
      return { state: next, events };
    }

    if (tmpl.objectiveType === 'kill') {
      const res = resolveEncounterTick(next, tickAtMs, q.locationId, content, tmpl.targetEnemyId);
      // if win and target matches, progress increases within resolveEncounterTick.
      return res;
    }

    if (tmpl.objectiveType === 'gather') {
      const loc = content.locationsById[q.locationId];
      // Helper: Find which table contains the target item
      const targetId = tmpl.targetItemId;
      let tableToRoll: LootTable | undefined;

      if (loc) {
        if (loc.miningTable?.entries.some(e => e.itemId === targetId)) tableToRoll = loc.miningTable;
        else if (loc.woodcuttingTable?.entries.some(e => e.itemId === targetId)) tableToRoll = loc.woodcuttingTable;
        else if (loc.foragingTable?.entries.some(e => e.itemId === targetId)) tableToRoll = loc.foragingTable;
      }

      if (tableToRoll) {
        const loot = rollLoot(tableToRoll, `questgather:${next.saveId}:${q.locationId}:${next.tickIndex}`);
        if (loot.length) {
          for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
          events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
          bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
        }
        gainXp(next, 1, events, tickAtMs);
        checkQuestCompletion(next, q.id, content, events, tickAtMs);
      }
      return { state: next, events };
    }

    // other objective types are future work.
    return { state: next, events };
  }

  return { state: next, events };
}

function resolveEncounterTick(state: EngineState, tickAtMs: number, locationId: string, content?: ContentIndex, forceEnemyId?: string): StepResult {
  const next = clone(state);
  const events: GameEvent[] = [];

  if (!content) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
    return { state: next, events };
  }

  const loc = content.locationsById[locationId];
  if (!loc) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOCATION_MISSING', message: `Unknown location ${locationId}` }));
    return { state: next, events };
  }

  // --- Active Combat ---
  if (next.activeEncounter) {
    const enemy = content.enemiesById[next.activeEncounter.enemyId];
    if (!enemy) {
      delete next.activeEncounter; // Panic cleanup
      return { state: next, events };
    }

    // Boss Phase / Enrage Check
    let currentAtkMult = 1.0;
    // let currentSpdMult = 1.0;

    if (enemy.rank === 'boss' && enemy.phases) {
      const hpPct = next.activeEncounter.enemyHp / next.activeEncounter.enemyMaxHp;
      // Simple check: is there an active phase?
      // MVP: Just check the first phase that matches.
      const activePhase = enemy.phases.find(p => hpPct <= p.triggerHpPct);
      if (activePhase && activePhase.buffs) {
        currentAtkMult = activePhase.buffs.atkMult ?? 1.0;
        // currentSpdMult = activePhase.buffs.spdMult ?? 1.0;
      }
    }

    // 1 Round of Combat
    // Player attacks
    const pStats = next.player.baseStats;
    let playerAtkMult = 1.0;
    if (next.player.tactics === 'aggressive') playerAtkMult = 1.2;
    if (next.player.tactics === 'defensive') playerAtkMult = 0.8;

    // Skill Bonus (Offense)
    // Identify Weapon Skill
    let offensiveSkill: SkillId = 'swordsmanship'; // default
    const weaponId = next.equipment.weapon;
    if (weaponId && content.itemsById[weaponId]) {
      const wTags = content.itemsById[weaponId].tags || [];
      if (wTags.includes('bow')) offensiveSkill = 'marksmanship';
      else if (wTags.includes('wand') || wTags.includes('staff')) offensiveSkill = 'arcana';
    }

    const offSkillLevel = next.player.skills[offensiveSkill].level;
    const skillDmgBonus = offSkillLevel * 0.005; // +0.5% per level
    playerAtkMult += skillDmgBonus;

    const dmgToEnemy = Math.max(1, Math.floor((pStats.atk * playerAtkMult) - enemy.baseStats.def));
    next.activeEncounter.enemyHp -= dmgToEnemy;

    // Gain Offense XP
    gainSkillXp(next, offensiveSkill, 1);

    if (next.activeEncounter.enemyHp <= 0) {
      // WIN
      const enemyLevel = next.activeEncounter.enemyLevel;
      events.push(ev(next, tickAtMs, 'ENCOUNTER_RESOLVED', { locationId: loc.id, enemyId: enemy.id, enemyLevel, outcome: 'win' }));

      // Drops
      const loot = rollLoot(enemy.lootTable, `loot:${next.saveId}:${enemy.id}:${next.tickIndex}`);
      if (loot.length) {
        for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
        events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
        bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
      }
      bumpQuestProgressFromKill(next, enemy.id, events, tickAtMs, content);

      const goldDrop = Math.max(1, enemyLevel * (enemy.rank === 'boss' ? 10 : 1));
      next.player.gold += goldDrop;
      events.push(ev(next, tickAtMs, 'GOLD_CHANGED', { amount: goldDrop, newTotal: next.player.gold }));
      gainXp(next, 2 + (enemy.rank === 'boss' ? 18 : 0), events, tickAtMs);

      delete next.activeEncounter;
      return { state: next, events };
    }

    // Enemy Attack
    const enemyAtk = enemy.baseStats.atk * (currentAtkMult);
    // Defense Skill
    const defSkillLevel = next.player.skills.defense.level;
    const mitigationPct = Math.min(0.2, defSkillLevel * 0.002); // 0.2% per level, cap 20%

    const dmgToPlayer = Math.max(0, Math.floor(enemyAtk - pStats.def));
    const mitigatedDmg = Math.floor(dmgToPlayer * (1 - mitigationPct));

    // Apply Damage
    next.player.baseStats.hp = Math.max(0, next.player.baseStats.hp - mitigatedDmg);

    // Gain Defense XP
    if (dmgToPlayer > 0) gainSkillXp(next, 'defense', 1);

    // Death Check
    if (next.player.baseStats.hp <= 0) {
      // Lose gold/xp? logic for MVP: Just Respawn/Idle
      // Let's set HP to 1 and state to Recovery or Idle?
      // For strict MVP: just stop encounter and notify.
      const enemyLevel = next.activeEncounter.enemyLevel;
      delete next.activeEncounter;
      next.player.baseStats.hp = 1;
      next.activity = {
        id: `act_rec_${next.tickIndex}`,
        params: { type: 'recovery', durationMs: 10000 },
        startedAtMs: tickAtMs
      };
      events.push(ev(next, tickAtMs, 'ACTIVITY_SET', { activity: next.activity.params }));
      events.push(ev(next, tickAtMs, 'ENCOUNTER_RESOLVED', { locationId: loc.id, enemyId: enemy.id, enemyLevel, outcome: 'loss' }));
      // Maybe loss of gold?
    }

    return { state: next, events };
  }

  // --- No Encounter? Start One ---
  const enemyId = forceEnemyId ?? pickWeighted(loc.encounterTable.entries, `enc:${next.saveId}:${locationId}:${next.tickIndex}`);
  const enemy = content.enemiesById[enemyId];
  if (!enemy) {
    // No encounter rolled
    return { state: next, events };
  }

  const enemyLevel = clamp(next.player.level + randIntDet(`elvl:${next.saveId}:${enemyId}:${next.tickIndex}`, -1, 1), enemy.levelMin ?? 1, enemy.levelMax ?? 100);

  // Initialize Combat State
  let hpScale = 1 + (enemyLevel * 0.1);
  if (enemy.rank === 'elite') hpScale *= 2;
  if (enemy.rank === 'boss') hpScale *= 5; // Bosses have much more HP

  const enemyMaxHp = Math.floor(enemy.baseStats.hpMax * hpScale);

  next.activeEncounter = {
    enemyId,
    enemyLevel,
    enemyHp: enemyMaxHp,
    enemyMaxHp
  };
  events.push(ev(next, tickAtMs, 'ENCOUNTER_STARTED', { locationId: loc.id, enemyId, enemyLevel }));

  return { state: next, events };
}

// ---- Quest helpers ----
function bumpQuestProgressFromKill(state: EngineState, killedEnemyId: string, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;
    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) continue;
    if (tmpl.objectiveType === 'kill' && tmpl.targetEnemyId === killedEnemyId) {
      q.progress.current = Math.min(q.progress.current + 1, q.progress.required);
      events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, current: q.progress.current, required: q.progress.required }));
    }
  }
}

function bumpQuestProgressFromLoot(state: EngineState, loot: Array<{ itemId: ItemId; qty: number }>, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;
    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) continue;
    if (tmpl.objectiveType === 'gather' && tmpl.targetItemId) {
      const gained = loot.filter((x) => x.itemId === tmpl.targetItemId).reduce((s, x) => s + x.qty, 0);
      if (gained > 0) {
        q.progress.current = Math.min(q.progress.current + gained, q.progress.required);
        events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, current: q.progress.current, required: q.progress.required }));
      }
    }
  }
}

function bumpQuestProgressFromCraft(state: EngineState, recipeId: string, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;
    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) continue;
    if (tmpl.objectiveType === 'craft' && tmpl.targetRecipeId === recipeId) {
      q.progress.current = Math.min(q.progress.current + 1, q.progress.required);
      events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, current: q.progress.current, required: q.progress.required }));
    }
  }
}

function checkQuestCompletion(state: EngineState, questId: string, content: ContentIndex, events: GameEvent[], atMs: number) {
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.status !== 'active') return;
  if (q.progress.current < q.progress.required) return;

  const tmpl = content.questTemplatesById[q.templateId];
  if (!tmpl) return;

  q.status = 'completed';
  q.completedAtMs = atMs;

  const rewards: RewardPack = tmpl.rewardPack;
  if (rewards.items) {
    for (const it of rewards.items) addItem(state.inventory, it.itemId, it.qty);
  }
  if (rewards.xp) gainXp(state, rewards.xp, events, atMs);
  if (rewards.gold) state.player.gold += rewards.gold;
  if (rewards.reputation) {
    for (const [k, v] of Object.entries(rewards.reputation)) {
      state.player.reputation[k] = (state.player.reputation[k] ?? 0) + v;
    }
  }

  events.push(ev(state, atMs, 'QUEST_COMPLETED', { questId: q.id, templateId: q.templateId, rewards }));
}

// ---- XP/Leveling ----
function gainXp(state: EngineState, amount: number, events: GameEvent[], atMs: number) {
  state.player.xp += amount;
  events.push(ev(state, atMs, 'XP_GAINED', { amount, newTotal: state.player.xp }));

  // Quadratic leveling curve: Threshold = 100 * level^2
  // Lvl 1 -> 100 xp (Total)
  // Lvl 2 -> 400 xp (Total)
  // Lvl 3 -> 900 xp (Total)
  while (state.player.xp >= 100 * Math.pow(state.player.level, 2)) {
    state.player.level += 1;

    // Stat Growth (Intrinsic)
    ensureIntrinsicStats(state);
    const stats = state.player.intrinsicStats!;
    stats.hpMax += 5;
    // For current HP, we heal the gain? 
    // We need to reflect this in the active baseStats too.
    // Easiest is to modify intrinsic, then recalculate.
    // But we also want to heal the player by 5.
    state.player.baseStats.hp += 5;

    stats.atk += 1;
    // Def +1 every 2 levels (0.5 per level)
    stats.def += 0.5;

    // Recalculate will sync intrinsic -> baseStats (effective)
    // We need content to recalculate properly though!
    // gainXp is called deep in logic.
    // engine.ts structure doesn't easily pass content everywhere.
    // gainXp signature: (state, amount, events, atMs)
    // We should pass content if possible, or just apply the delta to BOTH?
    // Applying delta to both is safe if we trust they are in sync.
    // BUT recalculate wipes baseStats from intrinsic + gear.
    // If we only update intrinsic, baseStats becomes stale until next equip.
    // If we update both, it's correct until next equip recalculation.
    // So let's update both manually here to avoid needing `content`.

    state.player.baseStats.hpMax += 5;
    state.player.baseStats.atk += 1;
    state.player.baseStats.def += 0.5;

    events.push(ev(state, atMs, 'LEVEL_UP', { newLevel: state.player.level }));
  }
}

function gainSkillXp(state: EngineState, skillId: SkillId, amount: number) {
  let s = state.player.skills[skillId];
  if (!s) {
    // Lazy migration: Initialize missing skill on first use
    s = { id: skillId, level: 1, xp: 0 };
    state.player.skills[skillId] = s;
  }
  s.xp += amount;
  // MVP: level up every 50 xp
  while (s.xp >= s.level * 50) {
    s.level += 1;
  }
}

// ---- Loot helpers ----
function rollLoot(table: LootTable | undefined, seed: string): Array<{ itemId: ItemId; qty: number }> {
  if (!table || !table.entries || table.entries.length === 0) return [];
  // MVP: roll exactly 1 entry per tick/fight
  const totalW = table.entries.reduce((s, e) => s + e.weight, 0);
  let r = hashFloat(`${seed}:pick`) * totalW;
  for (const e of table.entries) {
    r -= e.weight;
    if (r <= 0) {
      const qty = hashInt(`${seed}:qty`, e.minQty, e.maxQty);
      return [{ itemId: e.itemId, qty }];
    }
  }
  const last = table.entries[table.entries.length - 1]!;
  return [{ itemId: last.itemId, qty: 1 }];
}

function pickWeighted(entries: Array<{ enemyId: string; weight: number }>, seed: string): string {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = hashFloat(seed) * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.enemyId;
  }
  return entries[entries.length - 1]!.enemyId;
}

// ---- Inventory helpers ----
function addItem(inv: InventoryStack[], itemId: ItemId, qty: number) {
  const row = inv.find((x) => x.itemId === itemId);
  if (row) row.qty += qty;
  else inv.push({ itemId, qty });
}

function removeItem(inv: InventoryStack[], itemId: ItemId, qty: number) {
  const row = inv.find((x) => x.itemId === itemId);
  if (!row) return;
  row.qty -= qty;
  if (row.qty <= 0) {
    const idx = inv.indexOf(row);
    if (idx >= 0) inv.splice(idx, 1);
  }
}

function hasItem(inv: InventoryStack[], itemId: ItemId, qty: number): boolean {
  const row = inv.find((x) => x.itemId === itemId);
  return !!row && row.qty >= qty;
}

// ---- Utilities ----
function clone<T>(obj: T): T {
  // MVP: JSON clone (works for plain state)
  return JSON.parse(JSON.stringify(obj)) as T;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function randIntDet(seed: string, min: number, max: number): number {
  return hashInt(seed, min, max);
}

// let _evCounter = 0; // Removed global state
function ev<TType extends GameEvent['type']>(state: EngineState, atMs: number, type: TType, payload: Extract<GameEvent, { type: TType }>['payload']): GameEvent {
  state.nextEventId += 1;
  return {
    id: `ev_${state.saveId}_${state.tickIndex}_${state.nextEventId}`,
    atMs,
    type,
    payload: payload as any
  };
}

// Ensure state is migrated
function ensureIntrinsicStats(state: EngineState) {
  if (!state.player.intrinsicStats) {
    // Migration: assume current baseStats ARE the intrinsic stats (minus equipment?)
    // For MVP, just copy them. If player had equipment on, they get a permanent buff from "snapshotting" current stats as intrinsic.
    // Ideally we'd strip equipment stats, but we can't easily reverse without content index.
    // Acceptable risk for dev.
    state.player.intrinsicStats = clone(state.player.baseStats);
  }
}

export function recalculateStats(state: EngineState, content: ContentIndex) {
  ensureIntrinsicStats(state);
  const base = state.player.intrinsicStats!;

  // Start with intrinsic
  const effective = clone(base);
  effective.hp = state.player.baseStats.hp; // Preserve current HP from state tracking

  // Sum equipment modifiers
  const slots: Array<keyof typeof state.equipment> = ['weapon', 'armor', 'accessory1', 'accessory2'];
  for (const slot of slots) {
    const itemId = state.equipment[slot];
    if (!itemId) continue;
    const item = content.itemsById[itemId];
    if (item && item.modifiers) {
      if (item.modifiers.atk) effective.atk += item.modifiers.atk;
      if (item.modifiers.def) effective.def += item.modifiers.def;
      if (item.modifiers.hpMax) effective.hpMax += item.modifiers.hpMax;
      // Add other stats as needed
    }
  }

  // Apply update
  // We strictly overwrite baseStats properties, specifically max stats, but we must be careful with current HP.
  // Actually effective.hp carries the old current HP.
  // But if hpMax increased, current HP stays same? Or heals?
  // Standard RPG: equip doesn't heal, but unequipping might clamp.
  effective.hp = Math.min(effective.hp, effective.hpMax);

  state.player.baseStats = effective;
}
