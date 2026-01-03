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
  EnemyDef,
  ItemDef,
  LocationDef,
  RecipeDef,
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
export interface ContentIndex {
  itemsById: Record<string, ItemDef>;
  enemiesById: Record<string, EnemyDef>;
  locationsById: Record<string, LocationDef>;
  questTemplatesById: Record<string, QuestTemplateDef>;
  recipesById: Record<string, RecipeDef>;
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

    const oldHp = next.player.baseStats.hp;
    next.player.baseStats.hp = Math.min(maxHp, next.player.baseStats.hp + amount);

    // Optional: Event for healing? Might be spammy.
    // if (isRecovery) events.push(ev(next, tickAtMs, 'HEAL', { amount }));
  }

  // Regen Logic
  // Base regen: 1% max HP per 5 ticks (too slow?) -> Let's do 1% per tick for now to test, or 0.5%.
  // Recovery activity: 10% max HP per tick.
  const isRecovery = a.type === 'recovery';
  const regenPct = isRecovery ? 0.10 : 0.005; // 10% vs 0.5%

  // Only regen if injured
  // Calculate max HP (simplified, ideally we sum equipment stats here or cache it)
  // For MVP, using baseStats.hpMax. (Equipment modifiers not fully integrated in maxHp calc yet?)
  // Let's assume player.baseStats.hpMax IS the total for now, or we need a helper.
  // We haven't implemented robust stat recalculation on equip yet.
  // const maxHp = next.player.baseStats.hpMax;
  if (next.player.baseStats.hp < maxHp) { // Wait, player health is where? 
    // Checking createNewState... baseStats has hpMax. But where is current HP?
    // Ah, createNewState only has baseStats defined as:
    /*
      hpMax: 25,
      atk: 5...
    */
    // It seems I missed where current `hp` is stored. 
    // Looking at ACTIVE ENCOUNTER, enemyHp is there.
    // But player HP?
    // type CombatStats has hpMax.
    // Let's check shared/types.ts again.
    // PlayerState has baseStats: CombatStats.
    // CombatStats has hpMax.
    // It does NOT have 'hp'.
    // This is a bug in my previous understanding or the schema.
    // Let's look at how damage is handled in resolveEncounterTick.
    // "Player attacks... next.activeEncounter.enemyHp -= dmg".
    // "Enemy Attack Simulation... " it says "visual/flavor for now".
    // OH. Player HP isn't tracked yet?!
    // "Encounters" in this MVP seem to be one-sided or "safe"?
    // "Enemy Attack Simulation (visual/flavor for now...)"

    // I need to ADD player HP to the state if I want Recovery to mean anything.
    // Okay, I'll add `hp` to PlayerState or use `baseStats` if I modify the type.
    // Let's modify CombatStats to include `hp` (current hp).
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

  // --- Active Combat ---
  if (next.activeEncounter) {
    const enemy = content.enemiesById[next.activeEncounter.enemyId];
    if (!enemy) {
      delete next.activeEncounter; // Panic cleanup
      return { state: next, events };
    }

    // Boss Phase / Enrage Check
    let currentAtkMult = 1.0;
    let currentSpdMult = 1.0;

    if (enemy.rank === 'boss' && enemy.phases) {
      const hpPct = next.activeEncounter.enemyHp / next.activeEncounter.enemyMaxHp;
      // Simple check: is there an active phase?
      // MVP: Just check the first phase that matches.
      const activePhase = enemy.phases.find(p => hpPct <= p.triggerHpPct);
      if (activePhase && activePhase.buffs) {
        currentAtkMult = activePhase.buffs.atkMult ?? 1.0;
        currentSpdMult = activePhase.buffs.spdMult ?? 1.0;
      }
    }

    // 1 Round of Combat
    // Player attacks
    const pStats = next.player.baseStats;
    let playerAtkMult = 1.0;
    if (next.player.tactics === 'aggressive') playerAtkMult = 1.2;
    if (next.player.tactics === 'defensive') playerAtkMult = 0.8;

    const dmgToEnemy = Math.max(1, Math.floor((pStats.atk * playerAtkMult) - enemy.baseStats.def));
    next.activeEncounter.enemyHp -= dmgToEnemy;

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

    // Enemy Attack Simulation (visual/flavor for now, but affects "difficulty" perception)
    // If Boss is enraged, we could log it?
    if (currentAtkMult > 1.0) {
      // Debatable: spam event log vs just let it be silent math?
      // Let's rely on UI to show "BOSS IS ENRAGED" based on HP %.
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

  const enemyLevel = clamp(next.player.level + randIntDet(`elvl:${next.saveId}:${enemyId}:${next.tickIndex}`, -1, 1), 1, 99);

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
