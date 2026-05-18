/**
 * Shared types for Guildbound Chronicles.
 * These types are designed to be serializable (plain JSON) unless otherwise noted.
 */

// ---- ID aliases (keep as plain strings for JSON friendliness) ----
export type SaveId = string;
export type PlayerId = string;
export type ItemId = string;
export type EnemyId = string;
export type LocationId = string;
export type NpcId = string;
export type QuestTemplateId = string;
export type QuestInstanceId = string;
export type RecipeId = string;
export type BackendId = string;
export type TaskId = string;
export type EventId = string;

// ---- Core enums/unions ----
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type ItemType =
  | 'weapon'
  | 'armor'
  | 'accessory'
  | 'consumable'
  | 'material'
  | 'quest';

export type SkillId =
  | 'blacksmithing'
  | 'woodworking'
  | 'leatherworking'
  | 'swordsmanship'
  | 'marksmanship'
  | 'arcana'
  | 'defense'
  | 'mining'
  | 'woodcutting'
  | 'foraging';

export type ActivityType =
  | 'idle'
  | 'recovery'
  | 'quest'
  | 'hunt'
  | 'mine'
  | 'woodcut'
  | 'forage'
  | 'craft'
  | 'train'
  | 'trade'
  | 'explore'
  | 'adventure';

export type TacticsPreset = 'aggressive' | 'balanced' | 'defensive';

// ---- Content models (loaded from packages/content) ----
export interface ContentIndex {
  itemsById: Record<string, ItemDef>;
  enemiesById: Record<string, EnemyDef>;
  locationsById: Record<string, LocationDef>;
  questTemplatesById: Record<string, QuestTemplateDef>;
  recipesById: Record<string, RecipeDef>;
  npcsById: Record<string, NpcDef>;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  type: ItemType;
  rarity: Rarity;
  tags?: string[];
  description: string;
  stackable: boolean;
  value: number; // gold
  // Gameplay effects are deterministic and interpreted by engine
  modifiers?: Partial<CombatStats>;
  onUse?: {
    kind: 'heal' | 'buff' | 'cleanse';
    amount?: number;
    status?: string;
    durationTicks?: number;
  };
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  tags: string[];
  rank?: 'normal' | 'elite' | 'boss'; // Default to normal
  phases?: Array<{
    name: string;
    triggerHpPct: number; // 0.5 = 50%
    buffs?: {
      atkMult?: number;
      spdMult?: number;
    };
  }>;
  levelMin: number;
  levelMax: number;
  baseStats: CombatStats;
  lootTable: LootTable;
}

export interface LocationDef {
  id: LocationId;
  name: string;
  type?: 'town' | 'wild';
  image?: string;
  description: string;
  requirements?: {
    minLevel?: number;
    minCombatLevel?: number;
    minSkills?: Partial<Record<SkillId, number>>;
    requiredFlags?: string[];
    minAtk?: number;
    minDef?: number;
  };
  activities: ActivityType[];
  encounterTable: EncounterTable;
  miningTable?: LootTable;
  woodcuttingTable?: LootTable;
  foragingTable?: LootTable;
}

// Adventure step templates - deterministic quest types that AI can select
export type AdventureStepTemplate =
  | { type: 'kill'; targetEnemyId: EnemyId; qty: number }
  | { type: 'gather'; targetItemId: ItemId; qty: number }
  | { type: 'travel'; targetLocationId: LocationId }
  | { type: 'explore'; targetLocationId: LocationId; durationMs: number }
  | { type: 'craft'; targetRecipeId: RecipeId; qty: number }
  | { type: 'deliver'; targetItemId: ItemId; targetLocationId: LocationId; qty: number };

export interface QuestTemplateDef {
  id: QuestTemplateId;
  name?: string;
  description?: string;
  objectiveType: 'kill' | 'gather' | 'deliver' | 'explore' | 'craft' | 'escort' | 'reputation' | 'adventure';
  // targets refer to existing content IDs
  targetEnemyId?: EnemyId;
  targetItemId?: ItemId;
  targetLocationId?: LocationId;
  targetRecipeId?: RecipeId;
  qtyMin: number;
  qtyMax: number;
  locationPool: LocationId[];
  rewardPack: RewardPack;
  difficulty: 1 | 2 | 3 | 4 | 5;

  /**
   * NPC who hands out this quest. When set, ACCEPT_QUEST defaults its
   * `npcId` to this value (so the quest instance carries the giver) and
   * completing the quest bumps the giver's affinity. The UI surfaces
   * the giver on the quest board and in the NPC's dialogue modal.
   */
  questGiverNpcId?: NpcId;

  // Quest replenishment configuration (optional)
  replenishment?: {
    type: 'daily' | 'chain';
    // For daily quests
    cooldownHours?: number; // Default 24
    // For quest chains
    chainId?: string; // e.g., 'ore_mastery'
    chainStep?: number; // 1, 2, 3, etc.
    nextQuestId?: QuestTemplateId; // Next quest in chain
  };
}

export interface NpcDef {
  id: NpcId;
  name: string;
  role: 'quartermaster' | 'scout_captain' | 'apothecary' | 'scholar' | 'emissary' | 'generic';
  locationId: LocationId;
  personaCardId?: string; // narrative-only
  /**
   * Authored fallback prompts. Used both as seed context for AI flavor
   * generation in Phase 3c and as the text actually shown when AI is
   * disabled — the game must be fully playable without the gateway.
   */
  prompts?: {
    greeting?: string;
    questIntro?: string;
    topic?: string;
  };
}

export interface NpcStateEntry {
  firstMetAtMs?: number;
  lastInteractionMs?: number;
  /**
   * Affinity grows with each TALK_TO_NPC and successful quest from
   * this NPC. Capped at AFFINITY_CAP in the engine.
   */
  affinity: number;
  /**
   * AI-generated flavor for this NPC, persisted so subsequent visits
   * show the same dialogue rather than re-generating each time.
   * Populated by Phase 3c; absent for now.
   */
  generatedFlavor?: {
    description: string;
    dialogueLines: string[];
    generatedAtMs?: number;
  };
}

export interface RecipeDef {
  id: RecipeId;
  name: string;
  skill: SkillId;
  inputs: Array<{ itemId: ItemId; qty: number }>;
  outputs: Array<{ itemId: ItemId; qty: number }>;
  // skill gates
  requiredSkillLevel?: number;
}

// ---- Engine state models ----
export interface CombatStats {
  hp: number; // Current HP
  hpMax: number;
  atk: number;
  def: number;
  spd: number;
  critChance: number; // 0..1
  critMult: number; // e.g. 1.5
  res: number; // 0..1 (status resist)
}

export interface SkillState {
  id: SkillId;
  level: number;
  xp: number;
}

export interface InventoryStack {
  itemId: ItemId;
  qty: number;
}

export interface EquipmentState {
  weapon?: ItemId;
  armor?: ItemId;
  accessory1?: ItemId;
  accessory2?: ItemId;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  level: number;
  combatLevel: number;
  xp: number;
  gold: number;
  tactics: TacticsPreset;
  baseStats: CombatStats;
  intrinsicStats?: CombatStats;
  skills: Record<SkillId, SkillState>;
  reputation: Record<string, number>; // keyed by factionId
  flags: Record<string, boolean>; // milestones, discoveries
}

export interface QuestInstanceState {
  id: QuestInstanceId;
  templateId: QuestTemplateId;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  // For most templates a single counter is enough; keep it simple for MVP
  progress: {
    current: number;
    required: number;
  };
  locationId: LocationId;
  npcId?: NpcId;
  createdAtMs: number;
  completedAtMs?: number;

  // AI-generated narrative (optional)
  aiNarrative?: {
    title?: string;
    description?: string;
    flavorText?: string;
    generatedAtMs?: number;
  };

  // For AI-generated adventures (template-based)
  adventureSteps?: Array<{
    stepNumber: number;
    status: 'locked' | 'active' | 'completed';
    template: AdventureStepTemplate;
    narrative: {
      description: string;
      context?: string;
    };
    subQuestId?: QuestInstanceId;
  }>;

  // Rewards for AI-generated adventures
  adventureRewards?: {
    xp: number;
    gold: number;
    items?: Array<{ itemId: ItemId; qty: number }>;
  };
}

export type ActivityParams =
  | { type: 'idle' }
  | { type: 'recovery'; durationMs: number }
  | { type: 'hunt'; locationId: LocationId }
  | { type: 'mine'; locationId: LocationId }
  | { type: 'woodcut'; locationId: LocationId }
  | { type: 'forage'; locationId: LocationId }
  | { type: 'quest'; questId: QuestInstanceId }
  | { type: 'craft'; recipeId: RecipeId }
  | { type: 'train'; skillId: SkillId }
  | { type: 'trade'; locationId: LocationId }
  | { type: 'explore'; locationId: LocationId }
  | { type: 'adventure'; questId: QuestInstanceId };

export interface ActivityPlan {
  id: string;
  params: ActivityParams;
  startedAtMs: number;
  // optional: planned duration; engine can ignore for infinite activities
  durationTicks?: number;
}

export interface EngineMetrics {
  startTimeMs: number;
  startXp: number;
  startGold: number;
}

export interface EngineState {
  // Bumped when the shape of EngineState changes. Loading a save with
  // engineVersion > the engine's current version is refused; lower
  // values are migrated forward.
  engineVersion: number;
  // Tag of the content pack the save was last opened with. Used to
  // detect content-schema changes that need a re-stamp / lazy fixup.
  contentVersion: string;

  saveId: SaveId;
  createdAtMs: number;
  updatedAtMs: number;

  // deterministic timekeeping
  tickIndex: number;
  lastTickAtMs: number;
  nextEventId: number;

  // world positioning
  currentLocationId: LocationId;

  player: PlayerState;
  inventory: InventoryStack[];
  equipment: EquipmentState;
  quests: QuestInstanceState[];

  // current activity
  activity: ActivityPlan;

  // active combat state (if any)
  activeEncounter?: {
    enemyId: EnemyId;
    enemyLevel: number;
    enemyHp: number;
    enemyMaxHp: number;
  };

  // Quest availability tracking (for daily quests and chains)
  // Keys can be either QuestTemplateId (for daily quests) or chainId string (for chain progress)
  questAvailability: Record<QuestTemplateId | string, {
    type: 'daily' | 'chain';
    lastCompletedMs?: number; // For daily quests
    availableAfterMs?: number; // When it becomes available again
    chainProgress?: number; // Current step in chain (for chain entries keyed by chainId)
  }>;

  // Per-NPC interaction state. Backfilled by migrateState for saves
  // from before Phase 3a (engineVersion < 2).
  npcState: Record<NpcId, NpcStateEntry>;

  // metrics tracking
  metrics: EngineMetrics;
}

// ---- Commands (UI -> engine) ----
export type PlayerCommand =
  | {
    type: 'SET_ACTIVITY';
    params: ActivityParams;
    atMs: number;
  }
  | {
    type: 'ACCEPT_QUEST';
    templateId: QuestTemplateId;
    atMs: number;
    // optional overrides
    locationId?: LocationId;
    npcId?: NpcId;
  }
  | {
    type: 'ABANDON_QUEST';
    questId: QuestInstanceId;
    atMs: number;
  }
  | {
    type: 'EQUIP_ITEM';
    itemId: ItemId;
    slot: keyof EquipmentState;
    atMs: number;
  }
  | {
    type: 'UNEQUIP_ITEM';
    slot: keyof EquipmentState;
    atMs: number;
  }
  | {
    type: 'USE_ITEM';
    itemId: ItemId;
    atMs: number;
  }
  | {
    type: 'RESET_METRICS';
    atMs: number;
  }
  | {
    type: 'SET_TACTICS';
    tactics: TacticsPreset;
    atMs: number;
  }
  | {
    type: 'TRAVEL';
    locationId: LocationId;
    atMs: number;
  }
  | {
    type: 'BUY_ITEM';
    itemId: ItemId;
    qty: number;
    atMs: number;
  }
  | {

    type: 'SELL_ITEM';
    itemId: ItemId;
    qty: number;
    atMs: number;
  }
  | {
    type: 'DEBUG_ADD_ITEM';
    itemId: ItemId;
    qty: number;
    atMs: number;
  }
  | {
    type: 'ENHANCE_QUEST';
    questId: QuestInstanceId;
    narrative: {
      title?: string;
      description?: string;
      flavorText?: string;
    };
    atMs: number;
  }
  | {
    type: 'RESET_SKILLS';
    atMs: number;
  }
  | {
    type: 'GENERATE_ADVENTURE_QUEST';
    locationId: LocationId;
    adventureSpec: {
      title: string;
      description: string;
      steps: Array<{
        stepNumber: number;
        template: AdventureStepTemplate;
        narrative: {
          description: string;
          context?: string;
        };
      }>;
      difficulty: 1 | 2 | 3 | 4 | 5;
      rewards: {
        xp: number;
        gold: number;
        items?: Array<{ itemId: ItemId; qty: number }>;
      };
    };
    atMs: number;
  }
  | {
    // Phase 3a: record an interaction with an NPC. Increments their
    // affinity (capped engine-side) and stamps first/last interaction
    // timestamps. Reject silently if `npcId` is not in the content pack.
    type: 'TALK_TO_NPC';
    npcId: NpcId;
    atMs: number;
  }
  | {
    // Phase 3c: persist AI-generated dialogue/flavor for an NPC into
    // `state.npcState[npcId].generatedFlavor`. Generation itself happens
    // in `web/src/services/npcDialogue.ts` (calls the gateway); the
    // engine just records the result so it survives reloads and
    // subsequent visits reuse the same lines.
    type: 'SET_NPC_FLAVOR';
    npcId: NpcId;
    flavor: {
      description: string;
      dialogueLines: string[];
    };
    atMs: number;
  };

// ---- Rewards / loot ----
export interface RewardPack {
  xp: number;
  gold: number;
  reputation?: Record<string, number>;
  items?: Array<{ itemId: ItemId; qty: number }>;
}

export interface LootEntry {
  itemId: ItemId;
  minQty: number;
  maxQty: number;
  weight: number;
}

export interface LootTable {
  entries: LootEntry[];
}

export interface EncounterEntry {
  enemyId: EnemyId;
  weight: number;
}

export interface EncounterTable {
  entries: EncounterEntry[];
}

// ---- Engine events (engine -> UI & narrative) ----
export type GameEvent =
  | BaseEvent<'TICK_PROCESSED', { ticks: number }>
  | BaseEvent<'ACTIVITY_SET', { activity: ActivityParams }>
  | BaseEvent<'QUEST_ACCEPTED', { questId: QuestInstanceId; templateId: QuestTemplateId; locationId: LocationId; npcId?: NpcId }>
  | BaseEvent<'QUEST_PROGRESS', { questId: QuestInstanceId; gained: number; current: number; required: number }>
  | BaseEvent<'QUEST_COMPLETED', { questId: QuestInstanceId; templateId: QuestTemplateId; rewards: RewardPack }>
  | BaseEvent<'ENCOUNTER_STARTED', { locationId: LocationId; enemyId: EnemyId; enemyLevel: number }>
  | BaseEvent<'ENCOUNTER_RESOLVED', { locationId: LocationId; enemyId: EnemyId; enemyLevel: number; outcome: 'win' | 'loss' | 'escape' }>
  | BaseEvent<'LOOT_GAINED', { items: Array<{ itemId: ItemId; qty: number }> }>
  | BaseEvent<'XP_GAINED', { amount: number; newTotal: number }>
  | BaseEvent<'SKILL_XP_GAINED', { skillId: SkillId; amount: number; newXp: number; level: number }>
  | BaseEvent<'GOLD_CHANGED', { amount: number; newTotal: number }>
  | BaseEvent<'LEVEL_UP', { newLevel: number }>
  | BaseEvent<'SKILL_PROCS', { skillId: SkillId; effect: string; value?: number }>
  | BaseEvent<'TACTICS_CHANGED', { tactics: TacticsPreset }>
  | BaseEvent<'ITEM_CONSUMED', { itemId: ItemId }>
  | BaseEvent<'ERROR', { code: string; message: string }>
  | BaseEvent<'FLAVOR_TEXT', { message: string }>
  | BaseEvent<'NPC_INTERACTED', { npcId: NpcId; affinity: number; firstMeet: boolean }>
  ;

export interface BaseEvent<TType extends string, TPayload> {
  id: EventId;
  atMs: number;
  type: TType;
  payload: TPayload;
}

// ---- Offline catch-up summary ----
export interface OfflineSummary {
  durationMs: number;
  ticksProcessed: number;
  cappedAtMs?: number;
  kills: Record<EnemyId, number>;
  loot: Record<ItemId, number>;
  xpGained: number;
  goldDelta: number;
  questsCompleted: number;
  levelUps: number;
}

// ---- Next-goal widget ----
// A short list of things the player can productively work toward next.
// Produced by the engine, consumed by the UI; never persisted.
export type GoalCategory = 'quest' | 'recipe' | 'location' | 'skill' | 'reputation';

export type GoalActionTab =
  | 'activity'
  | 'travel'
  | 'inventory'
  | 'crafting'
  | 'character'
  | 'quests';

export interface Goal {
  id: string;
  label: string;
  category: GoalCategory;
  // Generic 2-number progress. For quests it's quest progress; for
  // recipes it's currentSkillLevel/requiredSkillLevel; for locations
  // it's the closest unmet gate (e.g. player.level / minLevel).
  progress: { current: number; required: number };
  // Optional hint for the UI to wire "go to..." buttons.
  actionHint?: {
    tab: GoalActionTab;
    recipeId?: RecipeId;
    locationId?: LocationId;
    questId?: QuestInstanceId;
    questTemplateId?: QuestTemplateId;
  };
}

// ---- Narrative tasks & outputs (gateway <-> web) ----
export type NarrativeTaskType = 'quest_flavor' | 'npc_dialogue' | 'rumor_feed' | 'journal_entry' | 'bestiary_entry';

export interface NarrativeConstraints {
  maxCharsPerLine?: number;
  maxLines?: number;
  maxCharsTotal?: number;
  tone?: 'grim' | 'hopeful' | 'mysterious' | 'comic' | 'neutral';
}

export interface FactsPacket {
  // Minimal, deterministic, machine-friendly facts.
  nowMs: number;
  locationId: LocationId;
  player: {
    level: number;
    tactics: TacticsPreset;
    equipped: EquipmentState;
    skills: Partial<Record<SkillId, number>>;
  };
  events: GameEvent[]; // the triggering event(s)
}

export interface NarrativeTask {
  id: TaskId;
  type: NarrativeTaskType;
  backendId: BackendId;
  createdAtMs: number;
  references: Partial<{
    questId: QuestInstanceId;
    questTemplateId: QuestTemplateId;
    npcId: NpcId;
    enemyId: EnemyId;
    locationId: LocationId;
  }>;
  constraints: NarrativeConstraints;
  facts: FactsPacket;
  memorySummary?: string; // short summary of prior narrative context
}

export interface NarrativeBlock {
  id: string;
  type: NarrativeTaskType;
  createdAtMs: number;
  references: NarrativeTask['references'];
  title?: string;
  lines: string[];
  tags: string[];
}

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface TaskRecord {
  id: TaskId;
  type: NarrativeTaskType;
  status: TaskStatus;
  backendId: BackendId;
  model?: string;
  createdAtMs: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  error?: { message: string; code?: string };
  result?: NarrativeBlock;
}

export type TaskStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'line'; data: string }
  | { type: 'done'; data: { taskId: TaskId } }
  | { type: 'error'; data: { message: string } };

// ---- LLM backend metadata ----
export type BackendKind = 'cli' | 'api';

export interface BackendInfo {
  id: BackendId;
  kind: BackendKind;
  displayName: string;
  models: string[];
  // for CLI backends, the server will typically manage these
  healthy: boolean;
}
