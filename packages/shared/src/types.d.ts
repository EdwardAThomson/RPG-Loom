/**
 * Shared types for Guildbound Chronicles.
 * These types are designed to be serializable (plain JSON) unless otherwise noted.
 */
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
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'quest';
export type SkillId = 'blacksmithing' | 'woodworking' | 'leatherworking' | 'tailoring' | 'swordsmanship' | 'marksmanship' | 'arcana' | 'defense' | 'mining' | 'woodcutting' | 'foraging';
export type ActivityType = 'idle' | 'recovery' | 'quest' | 'hunt' | 'mine' | 'woodcut' | 'forage' | 'craft' | 'train' | 'trade' | 'explore';
export type TacticsPreset = 'aggressive' | 'balanced' | 'defensive';
export interface ContentIndex {
    itemsById: Record<string, ItemDef>;
    enemiesById: Record<string, EnemyDef>;
    locationsById: Record<string, LocationDef>;
    questTemplatesById: Record<string, QuestTemplateDef>;
    recipesById: Record<string, RecipeDef>;
}
export interface ItemDef {
    id: ItemId;
    name: string;
    type: ItemType;
    rarity: Rarity;
    tags?: string[];
    description: string;
    stackable: boolean;
    value: number;
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
    rank?: 'normal' | 'elite' | 'boss';
    phases?: Array<{
        name: string;
        triggerHpPct: number;
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
    description: string;
    requirements?: {
        minLevel?: number;
        minSkills?: Partial<Record<SkillId, number>>;
        requiredFlags?: string[];
    };
    activities: ActivityType[];
    encounterTable: EncounterTable;
    miningTable?: LootTable;
    woodcuttingTable?: LootTable;
    foragingTable?: LootTable;
}
export interface QuestTemplateDef {
    id: QuestTemplateId;
    objectiveType: 'kill' | 'gather' | 'deliver' | 'explore' | 'craft' | 'escort' | 'reputation';
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
    personaCardId?: string;
}
export interface RecipeDef {
    id: RecipeId;
    name: string;
    skill: SkillId;
    inputs: Array<{
        itemId: ItemId;
        qty: number;
    }>;
    outputs: Array<{
        itemId: ItemId;
        qty: number;
    }>;
    requiredSkillLevel?: number;
}
export interface CombatStats {
    hp: number;
    hpMax: number;
    atk: number;
    def: number;
    spd: number;
    critChance: number;
    critMult: number;
    res: number;
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
    intrinsicStats?: CombatStats;
    skills: Record<SkillId, SkillState>;
    reputation: Record<string, number>;
    flags: Record<string, boolean>;
}
export interface QuestInstanceState {
    id: QuestInstanceId;
    templateId: QuestTemplateId;
    status: 'active' | 'completed' | 'failed' | 'abandoned';
    progress: {
        current: number;
        required: number;
    };
    locationId: LocationId;
    npcId?: NpcId;
    createdAtMs: number;
    completedAtMs?: number;
}
export type ActivityParams = {
    type: 'idle';
} | {
    type: 'recovery';
    durationMs: number;
} | {
    type: 'hunt';
    locationId: LocationId;
} | {
    type: 'mine';
    locationId: LocationId;
} | {
    type: 'woodcut';
    locationId: LocationId;
} | {
    type: 'forage';
    locationId: LocationId;
} | {
    type: 'quest';
    questId: QuestInstanceId;
} | {
    type: 'craft';
    recipeId: RecipeId;
} | {
    type: 'train';
    skillId: SkillId;
} | {
    type: 'trade';
    locationId: LocationId;
} | {
    type: 'explore';
    locationId: LocationId;
};
export interface ActivityPlan {
    id: string;
    params: ActivityParams;
    startedAtMs: number;
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
    tickIndex: number;
    lastTickAtMs: number;
    nextEventId: number;
    currentLocationId: LocationId;
    player: PlayerState;
    inventory: InventoryStack[];
    equipment: EquipmentState;
    quests: QuestInstanceState[];
    activity: ActivityPlan;
    activeEncounter?: {
        enemyId: EnemyId;
        enemyLevel: number;
        enemyHp: number;
        enemyMaxHp: number;
    };
    metrics: EngineMetrics;
}
export type PlayerCommand = {
    type: 'SET_ACTIVITY';
    params: ActivityParams;
    atMs: number;
} | {
    type: 'ACCEPT_QUEST';
    templateId: QuestTemplateId;
    atMs: number;
    locationId?: LocationId;
    npcId?: NpcId;
} | {
    type: 'ABANDON_QUEST';
    questId: QuestInstanceId;
    atMs: number;
} | {
    type: 'EQUIP_ITEM';
    itemId: ItemId;
    slot: keyof EquipmentState;
    atMs: number;
} | {
    type: 'UNEQUIP_ITEM';
    slot: keyof EquipmentState;
    atMs: number;
} | {
    type: 'USE_ITEM';
    itemId: ItemId;
    atMs: number;
} | {
    type: 'RESET_METRICS';
    atMs: number;
} | {
    type: 'SET_TACTICS';
    tactics: TacticsPreset;
    atMs: number;
} | {
    type: 'TRAVEL';
    locationId: LocationId;
    atMs: number;
} | {
    type: 'BUY_ITEM';
    itemId: ItemId;
    qty: number;
    atMs: number;
} | {
    type: 'SELL_ITEM';
    itemId: ItemId;
    qty: number;
    atMs: number;
} | {
    type: 'DEBUG_ADD_ITEM';
    itemId: ItemId;
    qty: number;
    atMs: number;
};
export interface RewardPack {
    xp: number;
    gold: number;
    reputation?: Record<string, number>;
    items?: Array<{
        itemId: ItemId;
        qty: number;
    }>;
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
export type GameEvent = BaseEvent<'TICK_PROCESSED', {
    ticks: number;
}> | BaseEvent<'ACTIVITY_SET', {
    activity: ActivityParams;
}> | BaseEvent<'QUEST_ACCEPTED', {
    questId: QuestInstanceId;
    templateId: QuestTemplateId;
    locationId: LocationId;
    npcId?: NpcId;
}> | BaseEvent<'QUEST_PROGRESS', {
    questId: QuestInstanceId;
    current: number;
    required: number;
}> | BaseEvent<'QUEST_COMPLETED', {
    questId: QuestInstanceId;
    templateId: QuestTemplateId;
    rewards: RewardPack;
}> | BaseEvent<'ENCOUNTER_STARTED', {
    locationId: LocationId;
    enemyId: EnemyId;
    enemyLevel: number;
}> | BaseEvent<'ENCOUNTER_RESOLVED', {
    locationId: LocationId;
    enemyId: EnemyId;
    enemyLevel: number;
    outcome: 'win' | 'loss' | 'escape';
}> | BaseEvent<'LOOT_GAINED', {
    items: Array<{
        itemId: ItemId;
        qty: number;
    }>;
}> | BaseEvent<'XP_GAINED', {
    amount: number;
    newTotal: number;
}> | BaseEvent<'GOLD_CHANGED', {
    amount: number;
    newTotal: number;
}> | BaseEvent<'LEVEL_UP', {
    newLevel: number;
}> | BaseEvent<'SKILL_PROCS', {
    skillId: SkillId;
    effect: string;
    value?: number;
}> | BaseEvent<'TACTICS_CHANGED', {
    tactics: TacticsPreset;
}> | BaseEvent<'ITEM_CONSUMED', {
    itemId: ItemId;
}> | BaseEvent<'ERROR', {
    code: string;
    message: string;
}> | BaseEvent<'FLAVOR_TEXT', {
    message: string;
}>;
export interface BaseEvent<TType extends string, TPayload> {
    id: EventId;
    atMs: number;
    type: TType;
    payload: TPayload;
}
export type NarrativeTaskType = 'quest_flavor' | 'npc_dialogue' | 'rumor_feed' | 'journal_entry' | 'bestiary_entry';
export interface NarrativeConstraints {
    maxCharsPerLine?: number;
    maxLines?: number;
    maxCharsTotal?: number;
    tone?: 'grim' | 'hopeful' | 'mysterious' | 'comic' | 'neutral';
}
export interface FactsPacket {
    nowMs: number;
    locationId: LocationId;
    player: {
        level: number;
        tactics: TacticsPreset;
        equipped: EquipmentState;
        skills: Partial<Record<SkillId, number>>;
    };
    events: GameEvent[];
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
    memorySummary?: string;
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
    error?: {
        message: string;
        code?: string;
    };
    result?: NarrativeBlock;
}
export type TaskStreamEvent = {
    type: 'token';
    data: string;
} | {
    type: 'line';
    data: string;
} | {
    type: 'done';
    data: {
        taskId: TaskId;
    };
} | {
    type: 'error';
    data: {
        message: string;
    };
};
export type BackendKind = 'cli' | 'api';
export interface BackendInfo {
    id: BackendId;
    kind: BackendKind;
    displayName: string;
    models: string[];
    healthy: boolean;
}
//# sourceMappingURL=types.d.ts.map