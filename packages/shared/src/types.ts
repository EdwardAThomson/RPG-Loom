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
  | 'swordsmanship'
  | 'archery'
  | 'arcana'
  | 'defense'
  | 'survival'
  | 'gathering'
  | 'crafting'
  | 'diplomacy';

export type ActivityType =
  | 'idle'
  | 'recovery'
  | 'quest'
  | 'hunt'
  | 'gather'
  | 'craft'
  | 'train'
  | 'trade'
  | 'explore';

export type TacticsPreset = 'aggressive' | 'balanced' | 'defensive';

// ---- Content models (loaded from packages/content) ----
export interface ItemDef {
  id: ItemId;
  name: string;
  type: ItemType;
  rarity: Rarity;
  tags: string[];
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
  levelMin: number;
  levelMax: number;
  baseStats: CombatStats;
  lootTable: LootTable;
}

export interface LocationDef {
  id: LocationId;
  name: string;
  description: string;
  requirements?: {
    minLevel?: number;
    minSkills?: Partial<Record<SkillId, number>>;
    requiredFlags?: string[];
  };
  activities: ActivityType[];
  encounterTable: EncounterTable;
  resourceTable: LootTable; // used for gather/mine/etc.
}

export interface QuestTemplateDef {
  id: QuestTemplateId;
  objectiveType: 'kill' | 'gather' | 'deliver' | 'explore' | 'craft' | 'escort' | 'reputation';
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
}

export interface NpcDef {
  id: NpcId;
  name: string;
  role: 'quartermaster' | 'scout_captain' | 'apothecary' | 'scholar' | 'emissary' | 'generic';
  locationId: LocationId;
  personaCardId?: string; // narrative-only
}

export interface RecipeDef {
  id: RecipeId;
  name: string;
  inputs: Array<{ itemId: ItemId; qty: number }>;
  outputs: Array<{ itemId: ItemId; qty: number }>;
  // skill gates
  requiredCraftingLevel?: number;
}

// ---- Engine state models ----
export interface CombatStats {
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
  xp: number;
  gold: number;
  tactics: TacticsPreset;
  baseStats: CombatStats;
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
}

export type ActivityParams =
  | { type: 'idle' }
  | { type: 'recovery'; durationMs: number }
  | { type: 'hunt'; locationId: LocationId }
  | { type: 'gather'; locationId: LocationId }
  | { type: 'quest'; questId: QuestInstanceId }
  | { type: 'craft'; recipeId: RecipeId }
  | { type: 'train'; skillId: SkillId }
  | { type: 'trade'; locationId: LocationId }
  | { type: 'explore'; locationId: LocationId };

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
  version: 1;
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
  | BaseEvent<'QUEST_PROGRESS', { questId: QuestInstanceId; current: number; required: number }>
  | BaseEvent<'QUEST_COMPLETED', { questId: QuestInstanceId; templateId: QuestTemplateId; rewards: RewardPack }>
  | BaseEvent<'ENCOUNTER_STARTED', { locationId: LocationId; enemyId: EnemyId; enemyLevel: number }>
  | BaseEvent<'ENCOUNTER_RESOLVED', { locationId: LocationId; enemyId: EnemyId; enemyLevel: number; outcome: 'win' | 'loss' | 'escape' }>
  | BaseEvent<'LOOT_GAINED', { items: Array<{ itemId: ItemId; qty: number }> }>
  | BaseEvent<'XP_GAINED', { amount: number; newTotal: number }>
  | BaseEvent<'GOLD_CHANGED', { amount: number; newTotal: number }>
  | BaseEvent<'LEVEL_UP', { newLevel: number }>
  | BaseEvent<'LEVEL_UP', { newLevel: number }>
  | BaseEvent<'ITEM_CONSUMED', { itemId: ItemId }>
  | BaseEvent<'ERROR', { code: string; message: string }>
  ;

export interface BaseEvent<TType extends string, TPayload> {
  id: EventId;
  atMs: number;
  type: TType;
  payload: TPayload;
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
