import { z } from 'zod';
// NOTE: these schemas are intentionally partial for MVP. Expand as engine and gateway grow.
export const RaritySchema = z.enum(['common', 'uncommon', 'rare', 'epic']);
export const ItemTypeSchema = z.enum(['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest']);
export const SkillIdSchema = z.enum([
    'swordsmanship',
    'marksmanship',
    'arcana',
    'defense',
    'blacksmithing',
    'woodworking',
    'leatherworking',
    'mining',
    'woodcutting',
    'foraging'
]);
export const ActivityTypeSchema = z.enum(['idle', 'quest', 'hunt', 'gather', 'craft', 'train', 'trade', 'explore']);
export const TacticsPresetSchema = z.enum(['aggressive', 'balanced', 'defensive']);
export const CombatStatsSchema = z.object({
    hpMax: z.number().int().nonnegative(),
    atk: z.number().int().nonnegative(),
    def: z.number().int().nonnegative(),
    spd: z.number().int().nonnegative(),
    critChance: z.number().min(0).max(1),
    critMult: z.number().min(1),
    res: z.number().min(0).max(1)
});
export const InventoryStackSchema = z.object({
    itemId: z.string().min(1),
    qty: z.number().int().positive()
});
export const EquipmentSlotsSchema = z.object({
    weapon: z.string().min(1).nullable(),
    armor: z.string().min(1).nullable(),
    accessory1: z.string().min(1).nullable(),
    accessory2: z.string().min(1).nullable()
});
export const SkillStateSchema = z.object({
    level: z.number().int().nonnegative(),
    xp: z.number().int().nonnegative()
});
export const PlayerStateSchema = z.object({
    playerId: z.string().min(1),
    level: z.number().int().positive(),
    xp: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    reputation: z.record(z.string(), z.number().int().nonnegative()),
    baseStats: CombatStatsSchema,
    skills: z.record(SkillIdSchema, SkillStateSchema),
    tactics: TacticsPresetSchema
});
export const ActivityPlanSchema = z.object({
    activityId: z.string().min(1),
    type: ActivityTypeSchema,
    locationId: z.string().min(1),
    // params is open-ended per activity type
    params: z.record(z.string(), z.any()).default({})
});
export const QuestProgressSchema = z.object({
    current: z.number().int().nonnegative(),
    target: z.number().int().positive()
});
export const QuestInstanceSchema = z.object({
    id: z.string().min(1),
    templateId: z.string().min(1),
    status: z.enum(['active', 'completed', 'failed']),
    locationId: z.string().min(1),
    npcId: z.string().min(1).nullable(),
    progress: QuestProgressSchema
});
export const EngineStateSchema = z.object({
    version: z.string().min(1),
    saveId: z.string().min(1),
    createdAtMs: z.number().int().nonnegative(),
    updatedAtMs: z.number().int().nonnegative(),
    tickIndex: z.number().int().nonnegative(),
    nextEventId: z.number().int().nonnegative(),
    locationId: z.string().min(1),
    activity: ActivityPlanSchema,
    player: PlayerStateSchema,
    inventory: z.array(InventoryStackSchema),
    equipment: EquipmentSlotsSchema,
    flags: z.record(z.string(), z.boolean()),
    quests: z.array(QuestInstanceSchema)
});
// Game events (partial MVP set)
export const GameEventBaseSchema = z.object({
    id: z.string().min(1),
    atMs: z.number().int().nonnegative(),
    type: z.string().min(1)
});
export const GameEventSchema = z.union([
    GameEventBaseSchema.extend({
        type: z.literal('XP_GAINED'),
        data: z.object({ amount: z.number().int().positive(), reason: z.string().min(1) })
    }),
    GameEventBaseSchema.extend({
        type: z.literal('ITEM_ADDED'),
        data: z.object({ itemId: z.string().min(1), qty: z.number().int().positive(), reason: z.string().min(1) })
    }),
    GameEventBaseSchema.extend({
        type: z.literal('QUEST_PROGRESS'),
        data: z.object({ questId: z.string().min(1), current: z.number().int().nonnegative(), target: z.number().int().positive() })
    }),
    GameEventBaseSchema.extend({
        type: z.literal('QUEST_COMPLETED'),
        data: z.object({ questId: z.string().min(1), templateId: z.string().min(1) })
    })
]);
// Narrative
export const NarrativeTaskTypeSchema = z.enum(['quest_flavor', 'npc_dialogue', 'rumor_feed', 'journal_entry']);
export const NarrativeTaskSchema = z.object({
    id: z.string().min(1),
    type: NarrativeTaskTypeSchema,
    createdAtMs: z.number().int().nonnegative(),
    backendId: z.string().min(1).nullable(),
    references: z.record(z.string(), z.string()).default({}),
    facts: z.record(z.string(), z.any())
});
export const NarrativeBlockSchema = z.object({
    id: z.string().min(1),
    type: NarrativeTaskTypeSchema,
    createdAtMs: z.number().int().nonnegative(),
    references: z.record(z.string(), z.string()).default({}),
    title: z.string().min(1).optional(),
    lines: z.array(z.string().min(1)).default([]),
    tags: z.array(z.string()).default([])
});
