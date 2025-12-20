import {
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
} from '@rpg-loom/shared';

export {
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

import { hashFloat, hashInt, makeRng } from './rng.js';

// ---- Content Index (data pack) ----
export interface ContentIndex {
  itemsById: Record<string, { id: string; name: string; stackable: boolean; modifiers?: any; onUse?: any }>;
  enemiesById: Record<string, { id: string; name: string; baseStats: any; lootTable: LootTable }>;
  locationsById: Record<string, { id: string; name: string; encounterTable: { entries: Array<{ enemyId: string; weight: number }> }; resourceTable: LootTable }>;
  questTemplatesById: Record<string, QuestTemplateDef>;
  recipesById: Record<string, { id: string; inputs: Array<{ itemId: string; qty: number }>; outputs: Array<{ itemId: string; qty: number }>; requiredSkill?: { skillId: SkillId; minLevel: number } }>;
}

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
        archery: { id: 'archery', level: 1, xp: 0 },
        arcana: { id: 'arcana', level: 1, xp: 0 },
        defense: { id: 'defense', level: 1, xp: 0 },
        survival: { id: 'survival', level: 1, xp: 0 },
        gathering: { id: 'gathering', level: 1, xp: 0 },
        crafting: { id: 'crafting', level: 1, xp: 0 },
        diplomacy: { id: 'diplomacy', level: 1, xp: 0 }
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
    case 'SET_ACTIVITY': {
      next.activity = {
        id: `act_${cmd.params.type}_${next.tickIndex}`,
        params: cmd.params,
        startedAtMs: cmd.atMs
      };
      // update location if activity carries one
      if ('locationId' in cmd.params && cmd.params.locationId) {
        next.currentLocationId = cmd.params.locationId;
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
      break;
    }
    case 'UNEQUIP_ITEM': {
      (next.equipment as any)[cmd.slot] = undefined;
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
    case 'RESET_METRICS': {
      next.metrics = {
        startTimeMs: cmd.atMs,
        startXp: next.player.xp,
        startGold: next.player.gold
      };
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

  if (a.type === 'gather' || a.type === 'explore' || a.type === 'trade') {
    // MVP: gather gives 1 random resource from location resourceTable
    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
      return { state: next, events };
    }
    const loc = content.locationsById[a.locationId];
    if (!loc) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOCATION_MISSING', message: `Unknown location ${a.locationId}` }));
      return { state: next, events };
    }
    const loot = rollLoot(loc.resourceTable, `gather:${next.saveId}:${a.locationId}:${next.tickIndex}`);
    if (loot.length) {
      for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
      events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
      gainXp(next, 1, events, tickAtMs);
      bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
    }
    return { state: next, events };
  }

  if (a.type === 'craft') {
    if (!content) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
      return { state: next, events };
    }
    const recipe = content.recipesById[a.recipeId];
    if (!recipe) {
      events.push(ev(next, tickAtMs, 'ERROR', { code: 'RECIPE_MISSING', message: `Unknown recipe ${a.recipeId}` }));
      return { state: next, events };
    }
    // Crafting is not per-tick in the final design; MVP: attempt craft once per tick.
    if (!recipe.inputs.every((i) => hasItem(next.inventory, i.itemId, i.qty))) {
      // can't craft; idle
      return { state: next, events };
    }
    for (const i of recipe.inputs) removeItem(next.inventory, i.itemId, i.qty);
    for (const o of recipe.outputs) addItem(next.inventory, o.itemId, o.qty);
    events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: recipe.outputs.map((o) => ({ itemId: o.itemId, qty: o.qty })) }));
    gainXp(next, 2, events, tickAtMs);
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
      const loot = rollLoot(content.locationsById[q.locationId]?.resourceTable, `questgather:${next.saveId}:${q.locationId}:${next.tickIndex}`);
      if (loot.length) {
        for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
        events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
        bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
      }
      gainXp(next, 1, events, tickAtMs);
      checkQuestCompletion(next, q.id, content, events, tickAtMs);
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

  const enemyId = forceEnemyId ?? pickWeighted(loc.encounterTable.entries, `enc:${next.saveId}:${locationId}:${next.tickIndex}`);
  const enemy = content.enemiesById[enemyId];
  if (!enemy) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'ENEMY_MISSING', message: `Unknown enemy ${enemyId}` }));
    return { state: next, events };
  }

  const enemyLevel = clamp(next.player.level + randIntDet(`elvl:${next.saveId}:${enemyId}:${next.tickIndex}`, -1, 1), 1, 99);
  events.push(ev(next, tickAtMs, 'ENCOUNTER_STARTED', { locationId: loc.id, enemyId, enemyLevel }));

  const outcome = resolveSimpleCombat(next, enemy.baseStats, `fight:${next.saveId}:${enemyId}:${next.tickIndex}`);
  events.push(ev(next, tickAtMs, 'ENCOUNTER_RESOLVED', { locationId: loc.id, enemyId, enemyLevel, outcome }));

  if (outcome === 'win') {
    const loot = rollLoot(enemy.lootTable, `loot:${next.saveId}:${enemyId}:${next.tickIndex}`);
    if (loot.length) {
      for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
      events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
      bumpQuestProgressFromKill(next, enemyId, events, tickAtMs, content);
    }
    gainXp(next, 2, events, tickAtMs);
  } else if (outcome === 'loss') {
    // Death penalty: 10% of current level progress lost
    const prevLevelThreshold = 100 * Math.pow(next.player.level - 1, 2);
    const nextLevelThreshold = 100 * Math.pow(next.player.level, 2);
    const levelSpan = nextLevelThreshold - prevLevelThreshold;
    const penalty = Math.floor(levelSpan * 0.1);

    // Ensure we don't de-level (MVP choice)
    const newXp = Math.max(prevLevelThreshold, next.player.xp - penalty);
    const lostAmount = next.player.xp - newXp;
    next.player.xp = newXp;

    events.push(ev(next, tickAtMs, 'XP_GAINED', { amount: -lostAmount, newTotal: next.player.xp })); // Reusing XP_GAINED for loss
    events.push(ev(next, tickAtMs, 'ENCOUNTER_RESOLVED', { locationId: loc.id, enemyId, enemyLevel, outcome: 'loss' }));

    // Switch to recovery for 60s
    next.activity = {
      id: `act_recovery_${next.tickIndex}`,
      params: { type: 'recovery', durationMs: 60000 },
      startedAtMs: tickAtMs
    };
    events.push(ev(next, tickAtMs, 'ACTIVITY_SET', { activity: next.activity.params }));

    // Return early to stop processing for this tick
    return { state: next, events };
  }

  // Check any quest completion after applying progress
  for (const q of next.quests.filter((q) => q.status === 'active')) {
    checkQuestCompletion(next, q.id, content, events, tickAtMs);
  }

  return { state: next, events };
}

function resolveSimpleCombat(state: EngineState, enemyStats: any, seed: string): 'win' | 'loss' {
  const p = state.player.baseStats;
  let atkMult = 1.0;
  let defMult = 1.0;

  if (state.player.tactics === 'aggressive') {
    atkMult = 1.2;
    defMult = 0.8;
  } else if (state.player.tactics === 'defensive') {
    atkMult = 0.8;
    defMult = 1.2;
  }

  const playerPower = (p.atk * atkMult) * 2 + (p.def * defMult) * 2 + state.player.level * 2 + hashInt(`${seed}:player_power`, 0, 3);
  const enemyPower = (enemyStats?.atk ?? 1) * 2 + (enemyStats?.def ?? 1) * 2 + hashInt(`${seed}:enemy_power`, 0, 3);
  return playerPower >= enemyPower ? 'win' : 'loss';
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
    events.push(ev(state, atMs, 'LEVEL_UP', { newLevel: state.player.level }));
  }
}

function gainSkillXp(state: EngineState, skillId: SkillId, amount: number) {
  const s = state.player.skills[skillId];
  s.xp += amount;
  // MVP: level up every 50 xp
  while (s.xp >= s.level * 50) {
    s.level += 1;
  }
}

// ---- Loot helpers ----
function rollLoot(table: LootTable | undefined, seed: string): Array<{ itemId: ItemId; qty: number }> {
  if (!table || !table.entries || table.entries.length === 0) return [];
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
