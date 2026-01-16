import type {
  ActivityParams,
  EngineState,
  GameEvent,
  InventoryStack,
  ItemId,
  LocationId,
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

const STARTING_INTRINSIC_STATS = {
  hp: 25,
  hpMax: 25,
  atk: 5,
  def: 3,
  spd: 5,
  critChance: 0.05,
  critMult: 1.5,
  res: 0.05
};

// ---- Public API ----
export function createNewState(params: {
  saveId: string;
  playerId: string;
  playerName: string;
  nowMs: number;
  startLocationId: string;
}): EngineState {
  const state: EngineState = {
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
      level: 0,
      combatLevel: 0,
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
      intrinsicStats: clone(STARTING_INTRINSIC_STATS),
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
      },
      reputation: {},
      flags: {}
    },
    inventory: [],
    equipment: {},
    quests: [],
    questAvailability: {}, // Quest replenishment tracking
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

  syncDerivedPlayerStats(state);
  return state;
}

export function applyCommand(state: EngineState, cmd: PlayerCommand, content?: ContentIndex): StepResult {
  const events: GameEvent[] = [];
  const next = clone(state);

  switch (cmd.type) {
    case 'DEBUG_ADD_ITEM': {
      addItem(next.inventory, cmd.itemId, cmd.qty);
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
        // If this is an adventure quest, clean up sub-quests
        if (q.adventureSteps) {
          abandonAdventure(next, q.id);
        }
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
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'LEVEL_TOO_LOW', message: `Total Level ${loc.requirements.minLevel} required.` }));
        break;
      }
      if (loc.requirements?.minCombatLevel && next.player.combatLevel < loc.requirements.minCombatLevel) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'COMBAT_LEVEL_TOO_LOW', message: `Combat Level ${loc.requirements.minCombatLevel} required.` }));
        break;
      }
      if (loc.requirements?.minAtk && next.player.baseStats.atk < loc.requirements.minAtk) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'STAT_TOO_LOW', message: `Attack ${loc.requirements.minAtk} required.` }));
        break;
      }
      if (loc.requirements?.minDef && next.player.baseStats.def < loc.requirements.minDef) {
        events.push(ev(next, cmd.atMs, 'ERROR', { code: 'STAT_TOO_LOW', message: `Defense ${loc.requirements.minDef} required.` }));
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

      // Check for travel quest completion
      if (content) {
        checkTravelQuests(next, cmd.locationId, events, cmd.atMs, content);
        checkDeliverQuests(next, events, cmd.atMs, content);
      }

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

    case 'ENHANCE_QUEST': {
      const quest = next.quests.find(q => q.id === cmd.questId);
      if (quest) {
        quest.aiNarrative = {
          ...cmd.narrative,
          generatedAtMs: cmd.atMs
        };
      }
      break;
    }

    case 'GENERATE_ADVENTURE_QUEST': {
      // Create a dynamic adventure quest from AI-generated spec
      const spec = cmd.adventureSpec;
      const quest: QuestInstanceState = {
        id: `q_adventure_${next.tickIndex}`,
        templateId: 'dynamic_adventure', // Special marker for AI quests
        status: 'active',
        progress: { current: 0, required: spec.steps.length },
        locationId: cmd.locationId,
        createdAtMs: cmd.atMs,
        adventureSteps: spec.steps.map((s, idx) => ({
          stepNumber: s.stepNumber,
          status: idx === 0 ? 'active' : 'locked', // First step is active, rest are locked
          template: s.template,
          narrative: s.narrative,
          subQuestId: undefined
        })),
        adventureRewards: spec.rewards,
        aiNarrative: {
          title: spec.title,
          description: spec.description,
          generatedAtMs: cmd.atMs
        }
      };
      next.quests.push(quest);

      // Don't spawn sub-quest yet - wait until user starts the adventure activity
      // This gives them time to review the adventure steps before committing

      events.push(
        ev(next, cmd.atMs, 'QUEST_ACCEPTED', {
          questId: quest.id,
          templateId: quest.templateId,
          locationId: cmd.locationId
        })
      );
      break;
    }

    case 'RESET_SKILLS': {
      // 1. Recalculate Skill Levels (XP IS SACROSANCT - READ ONLY)
      for (const key in next.player.skills) {
        const s = next.player.skills[key as SkillId];
        if (s) {
          s.level = 1;
          while (s.xp >= getTotalXpForSkillLevel(s.level + 1)) {
            s.level++;
          }
        }
      }

      // 2. Recalculate Total XP and Level from Skills
      syncDerivedPlayerStats(next);

      // 3. Reconstruct Intrinsic Stats from the derived Level
      ensureIntrinsicStats(next);
      next.player.intrinsicStats = clone(STARTING_INTRINSIC_STATS);
      // NOTE: Stat growth is still based on 'Player Level' (which is now sum of skills)
      // This will cause massive stat spikes if not balanced. 
      // But we follow the requirement for summation.
      for (let l = 1; l < next.player.level; l++) {
        next.player.intrinsicStats.hpMax += 5;
        next.player.intrinsicStats.atk += 1;
        next.player.intrinsicStats.def += 0.5;
      }

      if (content) recalculateStats(next, content);
      events.push(ev(next, cmd.atMs, 'FLAVOR_TEXT', { message: 'Levels and stats recalculated based on Skill Summation.' }));
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

  // Auto-spawn missing sub-quests for adventures (fixes old saves)
  if (a.type === 'adventure' && content) {
    const adventureParams = a as { type: 'adventure'; questId: string };
    const adventureQuest = next.quests.find(q => q.id === adventureParams.questId);
    if (adventureQuest && adventureQuest.adventureSteps) {
      const activeStepIndex = adventureQuest.adventureSteps.findIndex(
        step => step.status === 'active' && !step.subQuestId
      );

      if (activeStepIndex !== -1) {
        const subQuest = spawnAdventureSubQuest(next, adventureQuest, activeStepIndex, content, tickAtMs);
        if (subQuest) {
          next.quests.push(subQuest);
          events.push(
            ev(next, tickAtMs, 'QUEST_ACCEPTED', {
              questId: subQuest.id,
              templateId: subQuest.templateId,
              locationId: subQuest.locationId
            })
          );
          events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', {
            message: `New objective: ${adventureQuest.adventureSteps[activeStepIndex].narrative.description}`
          }));
        }
      }
    }
  }

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
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: 'You have recovered.' }));
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

    if (gainSkillXp(next, a.skillId, 1, events, tickAtMs) && content) recalculateStats(next, content);
    gainXp(next, 1, events, tickAtMs);
    return { state: next, events };
  }
  if (a.type === 'woodcut') {
    return performWoodcutTick(next, a.locationId, tickAtMs, content);
  }

  if (a.type === 'mine') {
    return performMineTick(next, a.locationId, tickAtMs, content);
  }

  if (a.type === 'forage') {
    return performForageTick(next, a.locationId, tickAtMs, content);
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
      // DEBUG LOG
      // console.log(`[Engine] Gather tick: loot count ${loot.length}`);

      if (loot.length) {
        if (skillId) {
          const skillLevel = next.player.skills[skillId].level;
          const doubleChance = Math.min(0.5, skillLevel * 0.01);
          if (hashFloat(`dbl:${next.saveId}:${next.tickIndex}`) < doubleChance) {
            for (const it of loot) it.qty *= 2;
            events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: "Critical gathering success! (x2)" }));
          }
          if (gainSkillXp(next, skillId, 1, events, tickAtMs) && content) recalculateStats(next, content);
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
        // Check for explore quest progression
        progressExploreQuests(next, events, tickAtMs, content);
      } else if (a.type === 'trade') {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You look for trade opportunities.` }));
      }
      gainXp(next, 1, events, tickAtMs); // Still gain XP for the activity
    }
    return { state: next, events };
  }

  if (a.type === 'craft') {
    return performCraftTick(next, a.recipeId, tickAtMs, content);
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

    // Dynamic sub-quests (from adventures) are handled by the adventure system
    // They track progress through kills/loot/etc, not through template objectives
    if (q.templateId.startsWith('dynamic_')) {
      // For dynamic_kill quests, run combat
      if (q.templateId.startsWith('dynamic_kill_')) {
        const enemyId = q.templateId.replace('dynamic_kill_', '');
        return resolveEncounterTick(next, tickAtMs, q.locationId, content, enemyId);
      }

      // For dynamic_explore quests, progress is tracked via progressExploreQuests
      if (q.templateId === 'dynamic_explore') {
        if (next.currentLocationId === q.locationId) {
          events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You are exploring the area for your quest...` }));
          progressExploreQuests(next, events, tickAtMs, content);
        } else {
          events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You need to be at ${content?.locationsById[q.locationId]?.name || q.locationId} to explore.` }));
        }
        return { state: next, events };
      }

      // For dynamic_gather quests, perform gathering
      if (q.templateId.startsWith('dynamic_gather_')) {
        const itemId = q.templateId.replace('dynamic_gather_', '');
        const loc = content.locationsById[q.locationId];

        let gatherResult: StepResult | null = null;
        if (loc) {
          if (loc.miningTable?.entries.some(e => e.itemId === itemId)) {
            gatherResult = performMineTick(next, q.locationId, tickAtMs, content);
          } else if (loc.woodcuttingTable?.entries.some(e => e.itemId === itemId)) {
            gatherResult = performWoodcutTick(next, q.locationId, tickAtMs, content);
          } else if (loc.foragingTable?.entries.some(e => e.itemId === itemId)) {
            gatherResult = performForageTick(next, q.locationId, tickAtMs, content);
          }
        }

        if (gatherResult) {
          return gatherResult;
        } else {
          events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', {
            message: `You search for quest items, but they aren't here.`
          }));
          return { state: next, events };
        }
      }

      // For dynamic_craft quests, perform crafting
      if (q.templateId.startsWith('dynamic_craft_')) {
        const recipeId = q.templateId.replace('dynamic_craft_', '');
        return performCraftTick(next, recipeId, tickAtMs, content);
      }

      // For dynamic_travel, progress is tracked via checkTravelQuests (instant when at location)
      // For dynamic_deliver, progress is tracked via checkDeliverQuests
      return { state: next, events };
    }

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
        // checkQuestCompletion(next, q.id, content, events, tickAtMs); // redundant now as bumpQuestProgressFromLoot does it
      } else {
        events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You search for quest items, but can't find them here.` }));
      }
      return { state: next, events };
    }

    // other objective types are future work.
    return { state: next, events };
  }


  return { state: next, events };
}

function performWoodcutTick(state: EngineState, locationId: string, tickAtMs: number, content?: ContentIndex): StepResult {
  const next = state;
  const events: GameEvent[] = [];

  if (!content) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content' }));
    return { state: next, events };
  }
  const loc = content.locationsById[locationId];
  if (!loc) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOC_MISSING', message: `No loc ${locationId}` }));
    return { state: next, events };
  }
  if (!loc.woodcuttingTable) {
    events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `There are no trees here.` }));
  } else {
    const loot = rollLoot(loc.woodcuttingTable, `wc:${next.saveId}:${next.tickIndex}`);
    if (loot.length) {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You chop some wood.` }));
      for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
      events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
      if (gainSkillXp(next, 'woodcutting', 1, events, tickAtMs) && content) recalculateStats(next, content);
      gainXp(next, 1, events, tickAtMs);
      bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
    } else {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You chop, but get no good wood.` }));
    }
  }
  return { state: next, events };
}

function performMineTick(state: EngineState, locationId: string, tickAtMs: number, content?: ContentIndex): StepResult {
  const next = state;
  const events: GameEvent[] = [];

  if (!content) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content' }));
    return { state: next, events };
  }
  const loc = content.locationsById[locationId];
  if (!loc) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOC_MISSING', message: `No loc ${locationId}` }));
    return { state: next, events };
  }
  if (!loc.miningTable) {
    events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `There are no ore veins here.` }));
  } else {
    const loot = rollLoot(loc.miningTable, `mine:${next.saveId}:${next.tickIndex}`);
    if (loot.length) {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You swing your pickaxe.` }));
      for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
      events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
      if (gainSkillXp(next, 'mining', 1, events, tickAtMs) && content) recalculateStats(next, content);
      gainXp(next, 1, events, tickAtMs);
      bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
    } else {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You swing your pickaxe but find nothing.` }));
    }
  }
  return { state: next, events };
}

function performForageTick(state: EngineState, locationId: string, tickAtMs: number, content?: ContentIndex): StepResult {
  const next = state;
  const events: GameEvent[] = [];

  if (!content) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content' }));
    return { state: next, events };
  }
  const loc = content.locationsById[locationId];
  if (!loc) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'LOC_MISSING', message: `No loc ${locationId}` }));
    return { state: next, events };
  }
  if (!loc.foragingTable) {
    events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `There is nothing to forage here.` }));
  } else {
    const loot = rollLoot(loc.foragingTable, `forage:${next.saveId}:${next.tickIndex}`);
    if (loot.length) {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You scour the area.` }));
      for (const it of loot) addItem(next.inventory, it.itemId, it.qty);
      events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: loot }));
      if (gainSkillXp(next, 'foraging', 1, events, tickAtMs) && content) recalculateStats(next, content);
      gainXp(next, 1, events, tickAtMs);
      bumpQuestProgressFromLoot(next, loot, events, tickAtMs, content);
    } else {
      events.push(ev(next, tickAtMs, 'FLAVOR_TEXT', { message: `You find nothing of interest.` }));
    }
  }
  return { state: next, events };
}

function performCraftTick(state: EngineState, recipeId: string, tickAtMs: number, content?: ContentIndex): StepResult {
  const next = state;
  const events: GameEvent[] = [];

  if (!content) {
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'CONTENT_MISSING', message: 'No content index provided' }));
    return { state: next, events };
  }
  const recipe = content.recipesById[recipeId];
  if (!recipe) {
    next.activity = { id: `act_idle_${next.tickIndex}`, params: { type: 'idle' }, startedAtMs: tickAtMs };
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'RECIPE_MISSING', message: `Unknown recipe ${recipeId}` }));
    return { state: next, events };
  }

  if (!recipe.inputs.every((i) => hasItem(next.inventory, i.itemId, i.qty))) {
    next.activity = { id: `act_idle_${next.tickIndex}`, params: { type: 'idle' }, startedAtMs: tickAtMs };
    return { state: next, events };
  }

  const skillId = recipe.skill || 'crafting';
  const skill = next.player.skills[skillId];
  const skillLevel = skill ? skill.level : 1;

  if (recipe.requiredSkillLevel && skillLevel < recipe.requiredSkillLevel) {
    next.activity = { id: `act_idle_${next.tickIndex}`, params: { type: 'idle' }, startedAtMs: tickAtMs };
    events.push(ev(next, tickAtMs, 'ERROR', { code: 'LEVEL_TOO_LOW', message: `Need ${recipe.skill} Lv.${recipe.requiredSkillLevel}` }));
    return { state: next, events };
  }

  // XP
  const xpGain = Math.max(10, (recipe.requiredSkillLevel || 1) * 10);
  gainXp(next, 5, events, tickAtMs);
  if (skillId && skill && gainSkillXp(next, skillId, xpGain, events, tickAtMs) && content) recalculateStats(next, content);

  const saveChance = Math.min(0.25, skillLevel * 0.005);
  const materialsSaved = hashFloat(`save:${next.saveId}:${next.tickIndex}`) < saveChance;

  if (!materialsSaved) {
    for (const i of recipe.inputs) removeItem(next.inventory, i.itemId, i.qty);
  } else {
    events.push(ev(next, tickAtMs, 'SKILL_PROCS', { skillId, effect: 'material_save' } as any));
  }

  for (const o of recipe.outputs) addItem(next.inventory, o.itemId, o.qty);
  events.push(ev(next, tickAtMs, 'LOOT_GAINED', { items: recipe.outputs.map((o) => ({ itemId: o.itemId, qty: o.qty })) }));

  bumpQuestProgressFromCraft(next, recipeId, events, tickAtMs, content);
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

    // Calculate Scaled Stats (Dynamic Level Scaling)
    const levelDelta = Math.max(0, next.activeEncounter.enemyLevel - (enemy.levelMin ?? 1));
    const scaledAtk = enemy.baseStats.atk + (levelDelta * 1.0);
    const scaledDef = enemy.baseStats.def + (levelDelta * 0.5);

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

    // Damage Formula: Percentage Mitigation
    // dmg = atk * (100 / (100 + def))
    const damageMultiplier = 100 / (100 + scaledDef);
    const rawDmgToEnemy = (pStats.atk * playerAtkMult) * damageMultiplier;
    const dmgToEnemy = Math.max(1, Math.floor(rawDmgToEnemy));
    next.activeEncounter.enemyHp -= dmgToEnemy;

    // Gain Offense XP
    if (gainSkillXp(next, offensiveSkill, 1, events, tickAtMs) && content) recalculateStats(next, content);

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
    const enemyAtk = scaledAtk * (currentAtkMult);
    // Defense Skill
    const defSkillLevel = next.player.skills.defense.level;
    const mitigationPct = Math.min(0.2, defSkillLevel * 0.002); // 0.2% per level, cap 20%

    // Damage Formula: Percentage Mitigation
    const mitigationMult = 100 / (100 + pStats.def);
    const dmgToPlayer = Math.floor(enemyAtk * mitigationMult);
    const mitigatedDmg = Math.floor(dmgToPlayer * (1 - mitigationPct));

    // Apply Damage
    next.player.baseStats.hp = Math.max(0, next.player.baseStats.hp - mitigatedDmg);

    // Gain Defense XP
    if (dmgToPlayer > 0 && gainSkillXp(next, 'defense', 1, events, tickAtMs) && content) recalculateStats(next, content);

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
    enemyMaxHp,
    // Store scaled stats for combat loop to use? 
    // Currently activeEncounter only stores enemyId/HP/Level.
    // We should probably compute this dynamically in the loop or store it.
    // MVP: Let's compute it in the loop to avoid State migration issues.
    // But wait, resolveEncounterTick recalculates stats every tick? No.
    // It reads `enemy.baseStats`.
    // We need to modify the loop to read SCALED stats.
  };
  events.push(ev(next, tickAtMs, 'ENCOUNTER_STARTED', { locationId: loc.id, enemyId, enemyLevel }));

  return { state: next, events };
}

// ---- Quest helpers ----
function bumpQuestProgressFromKill(state: EngineState, killedEnemyId: string, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;

    // Handle dynamic_kill quests (from adventures)
    if (q.templateId.startsWith('dynamic_kill_')) {
      const targetEnemyId = q.templateId.replace('dynamic_kill_', '');
      if (targetEnemyId === killedEnemyId) {
        q.progress.current = Math.min(q.progress.current + 1, q.progress.required);
        events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, gained: 1, current: q.progress.current, required: q.progress.required }));
        checkQuestCompletion(state, q.id, content, events, atMs);
      }
      continue;
    }

    // Handle template-based quests
    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) continue;
    if (tmpl.objectiveType === 'kill' && tmpl.targetEnemyId === killedEnemyId) {
      q.progress.current = Math.min(q.progress.current + 1, q.progress.required);
      events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, gained: 1, current: q.progress.current, required: q.progress.required }));
      checkQuestCompletion(state, q.id, content, events, atMs);
    }
  }
}

function bumpQuestProgressFromLoot(state: EngineState, loot: Array<{ itemId: ItemId; qty: number }>, events: GameEvent[], atMs: number, content: ContentIndex) {
  // console.log(`[Engine] bumpQuestProgressFromLoot called with ${loot.length} items`);
  for (const q of state.quests) {
    if (q.status !== 'active') continue;

    // Handle dynamic gather quests (e.g., dynamic_gather_frost_stone)
    if (q.templateId.startsWith('dynamic_gather_')) {
      const targetItemId = q.templateId.replace('dynamic_gather_', '');
      const gained = loot.filter((x) => x.itemId === targetItemId).reduce((s, x) => s + x.qty, 0);
      if (gained > 0) {
        q.progress.current = Math.min(q.progress.current + gained, q.progress.required);
        events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, gained, current: q.progress.current, required: q.progress.required }));
        checkQuestCompletion(state, q.id, content, events, atMs);
      }
      continue;
    }

    // Handle template-based gather quests
    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) continue;
    if (tmpl.objectiveType === 'gather' && tmpl.targetItemId) {
      const gained = loot.filter((x) => x.itemId === tmpl.targetItemId).reduce((s, x) => s + x.qty, 0);
      if (gained > 0) {
        q.progress.current = Math.min(q.progress.current + gained, q.progress.required);
        events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, gained, current: q.progress.current, required: q.progress.required }));
        checkQuestCompletion(state, q.id, content, events, atMs);
      }
    }
  }
}

function bumpQuestProgressFromCraft(state: EngineState, recipeId: string, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;

    // Handle dynamic_craft_ quests (from adventures)
    if (q.templateId.startsWith('dynamic_craft_')) {
      const targetRecipeId = q.templateId.replace('dynamic_craft_', '');
      if (targetRecipeId === recipeId) {
        q.progress.current = Math.min(q.progress.current + 1, q.progress.required);
        events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, gained: 1, current: q.progress.current, required: q.progress.required }));
        checkQuestCompletion(state, q.id, content, events, atMs);
      }
      continue;
    }

    // Handle template-based quests
    const tmpl = content.questTemplatesById[q.templateId];
    if (!tmpl) continue;
    if (tmpl.objectiveType === 'craft' && tmpl.targetRecipeId === recipeId) {
      q.progress.current = Math.min(q.progress.current + 1, q.progress.required);
      events.push(ev(state, atMs, 'QUEST_PROGRESS', { questId: q.id, gained: 1, current: q.progress.current, required: q.progress.required }));
      checkQuestCompletion(state, q.id, content, events, atMs);
    }
  }
}

/**
 * Check and complete travel quests when player arrives at destination
 */
function checkTravelQuests(state: EngineState, locationId: LocationId, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;

    // Check dynamic travel quests (from adventures)
    if (q.templateId === 'dynamic_travel' && q.locationId === locationId) {
      q.progress.current = q.progress.required;
      events.push(ev(state, atMs, 'QUEST_PROGRESS', {
        questId: q.id,
        gained: 1,
        current: q.progress.current,
        required: q.progress.required
      }));
      checkQuestCompletion(state, q.id, content, events, atMs);
    }
  }
}

/**
 * Check and complete deliver quests when player has items at location
 */
function checkDeliverQuests(state: EngineState, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;

    // Check dynamic deliver quests (from adventures)
    if (q.templateId.startsWith('dynamic_deliver_')) {
      const itemId = q.templateId.replace('dynamic_deliver_', '');
      const hasItems = state.inventory.find(stack => stack.itemId === itemId && stack.qty >= q.progress.required);
      const atLocation = state.currentLocationId === q.locationId;

      if (hasItems && atLocation && q.progress.current < q.progress.required) {
        q.progress.current = q.progress.required;
        events.push(ev(state, atMs, 'QUEST_PROGRESS', {
          questId: q.id,
          gained: q.progress.required,
          current: q.progress.current,
          required: q.progress.required
        }));
        checkQuestCompletion(state, q.id, content, events, atMs);
      }
    }
  }
}

/**
 * Progress explore quests (time-based at location)
 */
function progressExploreQuests(state: EngineState, events: GameEvent[], atMs: number, content: ContentIndex) {
  for (const q of state.quests) {
    if (q.status !== 'active') continue;

    // Check dynamic explore quests (from adventures)
    if (q.templateId === 'dynamic_explore') {
      const atLocation = state.currentLocationId === q.locationId;
      const isExploring = state.activity.params.type === 'explore' &&
        state.activity.params.locationId === q.locationId;

      if (atLocation && isExploring && q.progress.current < q.progress.required) {
        // Simple completion after some time (could be enhanced with duration check)
        const elapsedMs = atMs - q.createdAtMs;
        const requiredMs = 30000; // 30 seconds default

        if (elapsedMs >= requiredMs) {
          q.progress.current = q.progress.required;
          events.push(ev(state, atMs, 'QUEST_PROGRESS', {
            questId: q.id,
            gained: 1,
            current: q.progress.current,
            required: q.progress.required
          }));
          checkQuestCompletion(state, q.id, content, events, atMs);
        }
      }
    }
  }
}


function checkQuestCompletion(state: EngineState, questId: string, content: ContentIndex, events: GameEvent[], atMs: number) {
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.status !== 'active') return;
  if (q.progress.current < q.progress.required) return;

  // Ensure state is migrated for old saves
  ensureQuestAvailability(state);

  // Check if this is a dynamic quest (adventure sub-quest)
  const isDynamicQuest = q.templateId.startsWith('dynamic_');

  if (isDynamicQuest) {
    // Dynamic quests don't have templates, mark as completed
    q.status = 'completed';
    q.completedAtMs = atMs;

    // No rewards for sub-quests (rewards come from parent adventure)
    events.push(ev(state, atMs, 'QUEST_COMPLETED', {
      questId: q.id,
      templateId: q.templateId,
      rewards: {} as any
    }));

    // Check if this is an adventure sub-quest and handle step progression
    handleAdventureSubQuestCompletion(state, q.id, content, events, atMs);
    return;
  }

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

  // Handle quest replenishment
  if (tmpl.replenishment) {
    if (tmpl.replenishment.type === 'daily') {
      // Set cooldown for daily quest
      const cooldownMs = (tmpl.replenishment.cooldownHours || 24) * 60 * 60 * 1000;
      state.questAvailability[tmpl.id] = {
        type: 'daily',
        lastCompletedMs: atMs,
        availableAfterMs: atMs + cooldownMs
      };
    } else if (tmpl.replenishment.type === 'chain' && tmpl.replenishment.chainId) {
      // Update chain progress using chainId as the key
      const chainId = tmpl.replenishment.chainId;
      const current = state.questAvailability[chainId] || { type: 'chain', chainProgress: 0 };
      current.chainProgress = tmpl.replenishment.chainStep || 0;
      state.questAvailability[chainId] = current;
    }
  }
}

// ---- Adventure Quest Helpers ----
/**
 * Spawns a sub-quest from an adventure step template
 */
function spawnAdventureSubQuest(
  state: EngineState,
  adventureQuest: QuestInstanceState,
  stepIndex: number,
  _content: ContentIndex,
  atMs: number
): QuestInstanceState | null {
  const step = adventureQuest.adventureSteps![stepIndex];
  const template = step.template;

  // Handle old adventure steps that don't have templates
  if (!template) {
    console.warn(`[Engine] Adventure step ${stepIndex} missing template, cannot spawn sub-quest`);
    return null;
  }

  // Determine location for the sub-quest
  let locationId: string;
  if (template.type === 'travel' || template.type === 'explore' || template.type === 'deliver') {
    locationId = template.targetLocationId;
  } else {
    // For kill/gather/craft, use adventure's current location or find appropriate location
    locationId = adventureQuest.locationId;
  }

  // Create quest based on template type
  const subQuestId = `q_adv_sub_${adventureQuest.id}_step${stepIndex}_${state.tickIndex}`;

  let subQuest: QuestInstanceState;

  if (template.type === 'kill') {
    subQuest = {
      id: subQuestId,
      templateId: `dynamic_kill_${template.targetEnemyId}`,
      status: 'active',
      locationId,
      createdAtMs: atMs,
      progress: { current: 0, required: template.qty },
      aiNarrative: {
        title: step.narrative.description,
        description: step.narrative.context || `Kill ${template.qty} ${template.targetEnemyId}`,
        generatedAtMs: atMs
      }
    };
  } else if (template.type === 'gather') {
    subQuest = {
      id: subQuestId,
      templateId: `dynamic_gather_${template.targetItemId}`,
      status: 'active',
      locationId,
      createdAtMs: atMs,
      progress: { current: 0, required: template.qty },
      aiNarrative: {
        title: step.narrative.description,
        description: step.narrative.context || `Gather ${template.qty} ${template.targetItemId}`,
        generatedAtMs: atMs
      }
    };
  } else if (template.type === 'craft') {
    subQuest = {
      id: subQuestId,
      templateId: `dynamic_craft_${template.targetRecipeId}`,
      status: 'active',
      locationId,
      createdAtMs: atMs,
      progress: { current: 0, required: template.qty },
      aiNarrative: {
        title: step.narrative.description,
        description: step.narrative.context || `Craft ${template.qty} ${template.targetRecipeId}`,
        generatedAtMs: atMs
      }
    };
  } else if (template.type === 'travel') {
    // Travel quests auto-complete when player is at location
    subQuest = {
      id: subQuestId,
      templateId: 'dynamic_travel',
      status: 'active',
      locationId: template.targetLocationId,
      createdAtMs: atMs,
      progress: { current: 0, required: 1 },
      aiNarrative: {
        title: step.narrative.description,
        description: step.narrative.context || `Travel to ${template.targetLocationId}`,
        generatedAtMs: atMs
      }
    };
  } else if (template.type === 'explore') {
    // Explore quests are time-based
    subQuest = {
      id: subQuestId,
      templateId: 'dynamic_explore',
      status: 'active',
      locationId: template.targetLocationId,
      createdAtMs: atMs,
      progress: { current: 0, required: 1 },
      aiNarrative: {
        title: step.narrative.description,
        description: step.narrative.context || `Explore ${template.targetLocationId}`,
        generatedAtMs: atMs
      }
    };
  } else if (template.type === 'deliver') {
    // Deliver quests check inventory + location
    subQuest = {
      id: subQuestId,
      templateId: `dynamic_deliver_${template.targetItemId}`,
      status: 'active',
      locationId: template.targetLocationId,
      createdAtMs: atMs,
      progress: { current: 0, required: template.qty },
      aiNarrative: {
        title: step.narrative.description,
        description: step.narrative.context || `Deliver ${template.qty} ${template.targetItemId} to ${template.targetLocationId}`,
        generatedAtMs: atMs
      }
    };
  } else {
    return null; // Unknown template type
  }

  // Link sub-quest to adventure step
  step.subQuestId = subQuest.id;

  return subQuest;
}

/**
 * Activates the next adventure step and spawns its sub-quest
 */
function activateNextAdventureStep(
  state: EngineState,
  adventureQuestId: string,
  content: ContentIndex,
  events: GameEvent[],
  atMs: number
): void {
  const adventure = state.quests.find(q => q.id === adventureQuestId);
  if (!adventure || !adventure.adventureSteps) {
    console.warn('[Engine] activateNextAdventureStep: adventure not found or no steps');
    return;
  }

  // Find next locked step
  const nextStepIndex = adventure.adventureSteps.findIndex(s => s.status === 'locked');
  if (nextStepIndex === -1) {
    console.log('[Engine] activateNextAdventureStep: no more locked steps');
    return; // No more steps
  }

  const nextStep = adventure.adventureSteps[nextStepIndex];
  console.log(`[Engine] Activating adventure step ${nextStepIndex + 1}:`, nextStep.narrative.description);
  nextStep.status = 'active';

  // Spawn sub-quest for this step
  const subQuest = spawnAdventureSubQuest(state, adventure, nextStepIndex, content, atMs);
  if (subQuest) {
    console.log('[Engine] Spawned sub-quest:', subQuest.id, subQuest.templateId);
    state.quests.push(subQuest);
    events.push(ev(state, atMs, 'QUEST_ACCEPTED', {
      questId: subQuest.id,
      templateId: subQuest.templateId,
      locationId: subQuest.locationId
    }));
    events.push(ev(state, atMs, 'FLAVOR_TEXT', {
      message: `New objective: ${nextStep.narrative.description}`
    }));
  } else {
    console.error('[Engine] Failed to spawn sub-quest for step', nextStepIndex);
  }
}

/**
 * Handles completion of an adventure sub-quest
 */
function handleAdventureSubQuestCompletion(
  state: EngineState,
  subQuestId: string,
  content: ContentIndex,
  events: GameEvent[],
  atMs: number
): void {
  // Find the parent adventure quest
  const adventure = state.quests.find(q =>
    q.adventureSteps?.some(s => s.subQuestId === subQuestId)
  );

  if (!adventure || !adventure.adventureSteps) return;

  // Find the completed step
  const stepIndex = adventure.adventureSteps.findIndex(s => s.subQuestId === subQuestId);
  if (stepIndex === -1) return;

  const step = adventure.adventureSteps[stepIndex];
  step.status = 'completed';
  adventure.progress.current = stepIndex + 1;

  events.push(ev(state, atMs, 'QUEST_PROGRESS', {
    questId: adventure.id,
    gained: 1,
    current: adventure.progress.current,
    required: adventure.progress.required
  }));

  // Check if adventure is complete
  if (adventure.progress.current >= adventure.progress.required) {
    // All steps complete - award adventure rewards
    adventure.status = 'completed';
    adventure.completedAtMs = atMs;

    const rewards = adventure.adventureRewards || { xp: 300, gold: 150 };
    if (rewards.xp) gainXp(state, rewards.xp, events, atMs);
    if (rewards.gold) {
      state.player.gold += rewards.gold;
      events.push(ev(state, atMs, 'GOLD_CHANGED', { amount: rewards.gold, newTotal: state.player.gold }));
    }
    if (rewards.items) {
      for (const item of rewards.items) {
        addItem(state.inventory, item.itemId, item.qty);
      }
      events.push(ev(state, atMs, 'LOOT_GAINED', { items: rewards.items }));
    }

    events.push(ev(state, atMs, 'QUEST_COMPLETED', {
      questId: adventure.id,
      templateId: adventure.templateId,
      rewards: rewards as any
    }));
  } else {
    // Activate next step
    activateNextAdventureStep(state, adventure.id, content, events, atMs);
  }
}

/**
 * Cleans up all sub-quests when an adventure is abandoned
 */
function abandonAdventure(state: EngineState, adventureQuestId: string): void {
  const adventure = state.quests.find(q => q.id === adventureQuestId);
  if (!adventure || !adventure.adventureSteps) return;

  // Abandon all active sub-quests
  for (const step of adventure.adventureSteps) {
    if (step.subQuestId) {
      const subQuest = state.quests.find(q => q.id === step.subQuestId);
      if (subQuest && subQuest.status === 'active') {
        subQuest.status = 'abandoned';
      }
    }
  }
}


// ---- XP/Leveling ----
/**
 * Returns the TOTAL XP required to REACH the start of the given level.
 * Level 1: 0 XP
 * Level 2: 100 XP
 * Level 3: 220 XP (100 + 120)
 * etc.
 */
function getTotalXpForSkillLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(100 * Math.pow(1.2, i - 1));
  }
  return total;
}

function gainXp(state: EngineState, amount: number, events: GameEvent[], atMs: number) {
  // For now, general 'Player XP' still increments the total pool, 
  // but it will be slightly out of sync with the sum of skills unless we distribute it.
  // The user wants the UI to reflect the sum, so we'll ensure recalculation is called.
  state.player.xp += amount;
  events.push(ev(state, atMs, 'XP_GAINED', { amount, newTotal: state.player.xp }));

  // We no longer use the quadratic curve for 'Player Level'.
  // Instead, 'Player Level' is the summation of Skill levels.
  // We'll call the helper to ensure it's updated (though gainXp usually accompanied by gainSkillXp).
  syncDerivedPlayerStats(state);

  // Growth check
  // Since level can change via summation, we should ensure stats stay in sync.
  // However, recalculateTotalXpAndLevel doesn't handle the level-up stat gains (HP/Atk/Def) 
  // that were previously in this loop. We should probably move them to a 'syncPlayerStatsToLevel' helper.

  // NOTE: In the summation model, stat growth per 'Total Level' might be too fast.
  // If we have 10 skills at Level 10, Total Level is 100.
}

export function gainSkillXp(state: EngineState, skillId: SkillId, amount: number, events?: GameEvent[], atMs?: number): boolean {
  let s = state.player.skills[skillId];
  if (!s) {
    // Lazy migration: Initialize missing skill on first use
    s = { id: skillId, level: 1, xp: 0 };
    state.player.skills[skillId] = s;
  }
  s.xp += amount;

  // Emit skill XP gain event if events array provided
  if (events && atMs !== undefined) {
    events.push(ev(state, atMs, 'SKILL_XP_GAINED', {
      skillId,
      amount,
      newXp: s.xp,
      level: s.level
    } as any));
  }

  let leveledUp = false;

  // Exponential XP Curve (Total XP model)
  // Lvl 1 -> 100 (Total) -> Lvl 2
  // Lvl 2 -> 220 (Total) -> Lvl 3
  while (s.xp >= getTotalXpForSkillLevel(s.level + 1)) {
    s.level += 1;
    leveledUp = true;
  }

  // Update total player XP and Level
  syncDerivedPlayerStats(state);

  return leveledUp;
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
    state.player.intrinsicStats = clone(state.player.baseStats);
  }
}

function ensureQuestAvailability(state: EngineState) {
  if (!state.questAvailability) {
    state.questAvailability = {};
  }
}

export function syncDerivedPlayerStats(state: EngineState) {
  let totalXp = 0;
  let totalLevel = 0;
  let combatLevel = 0;

  const combatSkills: SkillId[] = ['swordsmanship', 'marksmanship', 'arcana', 'defense'];

  for (const skillId in state.player.skills) {
    const s = state.player.skills[skillId as SkillId];
    if (s) {
      totalXp += s.xp;
      totalLevel += s.level;
      if (combatSkills.includes(skillId as SkillId)) {
        combatLevel += s.level;
      }
    }
  }
  state.player.xp = totalXp;
  state.player.level = totalLevel;
  state.player.combatLevel = combatLevel;

  // Consolidate inventory (merge duplicate stacks)
  if (state.inventory.length > 0) {
    const merged: Record<string, number> = {};
    for (const stack of state.inventory) {
      merged[stack.itemId] = (merged[stack.itemId] || 0) + stack.qty;
    }
    state.inventory = Object.entries(merged).map(([itemId, qty]) => ({ itemId, qty }));
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
      if (item.modifiers.spd) effective.spd += item.modifiers.spd;
      if (item.modifiers.critChance) effective.critChance += item.modifiers.critChance;
    }
  }

  // Sum Skill Modifiers (Persistent Training)
  // Mapping:
  // Melee (swordsmanship): +1 ATK per level (above 1)
  // Ranged (marksmanship): +1 SPD per level, +0.5% Crit per level
  // Defense (defense): +1 DEF per level, +5 HP Max per level

  const s = state.player.skills;
  if (s.swordsmanship) {
    effective.atk += Math.max(0, s.swordsmanship.level - 1) * 0.5;
  }
  if (s.marksmanship) {
    effective.spd += Math.max(0, s.marksmanship.level - 1) * 1;
    effective.critChance += Math.max(0, s.marksmanship.level - 1) * 0.005;
  }
  if (s.defense) {
    effective.def += Math.max(0, s.defense.level - 1) * 0.5;
    effective.hpMax += Math.max(0, s.defense.level - 1) * 5;
  }

  // Apply update
  // We strictly overwrite baseStats properties, specifically max stats, but we must be careful with current HP.
  effective.hp = Math.min(effective.hp, effective.hpMax);

  state.player.baseStats = effective;
}

// ---- Quest Availability Helper ----

/**
 * Get available quests for the current location, respecting replenishment rules
 */
export function getAvailableQuests(state: EngineState, content: ContentIndex): QuestTemplateDef[] {
  const now = Date.now();
  const available: QuestTemplateDef[] = [];

  // Ensure state is migrated for old saves
  ensureQuestAvailability(state);

  // Safety check: ensure questTemplatesById exists
  if (!content?.questTemplatesById) {
    return available;
  }

  for (const [templateId, tmpl] of Object.entries(content.questTemplatesById)) {
    // Skip dynamic quest templates (these are sub-quests, not standalone quests)
    if (templateId.startsWith('dynamic_')) {
      continue;
    }

    // Skip if already active
    if (state.quests.some(q => q.templateId === templateId && q.status === 'active')) {
      continue;
    }

    // Check location
    if (!tmpl.locationPool.includes(state.currentLocationId)) {
      continue;
    }

    // Check replenishment rules
    if (tmpl.replenishment) {
      if (tmpl.replenishment.type === 'daily') {
        // Check cooldown using template ID
        const availability = state.questAvailability[templateId];
        if (availability?.availableAfterMs && now < availability.availableAfterMs) {
          continue; // Still on cooldown
        }
      } else if (tmpl.replenishment.type === 'chain' && tmpl.replenishment.chainId) {
        // Check chain progress using chainId
        const chainId = tmpl.replenishment.chainId;
        const chainAvailability = state.questAvailability[chainId];
        const chainStep = tmpl.replenishment.chainStep || 1;
        const chainProgress = chainAvailability?.chainProgress || 0;

        // Check if previous step is complete
        if (chainProgress < chainStep - 1) {
          continue; // Previous step not complete
        }

        // Don't show if already completed this step
        if (chainProgress >= chainStep) {
          continue;
        }
      }
    } else {
      // One-time quest - check if completed
      if (state.quests.some(q => q.templateId === templateId && q.status === 'completed')) {
        continue;
      }
    }

    available.push(tmpl);
  }

  return available;
}
