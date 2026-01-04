import { z } from 'zod';
export declare const RaritySchema: z.ZodEnum<["common", "uncommon", "rare", "epic"]>;
export declare const ItemTypeSchema: z.ZodEnum<["weapon", "armor", "accessory", "consumable", "material", "quest"]>;
export declare const SkillIdSchema: z.ZodEnum<["swordsmanship", "archery", "arcana", "defense", "survival", "gathering", "crafting", "diplomacy"]>;
export declare const ActivityTypeSchema: z.ZodEnum<["idle", "quest", "hunt", "gather", "craft", "train", "trade", "explore"]>;
export declare const TacticsPresetSchema: z.ZodEnum<["aggressive", "balanced", "defensive"]>;
export declare const CombatStatsSchema: z.ZodObject<{
    hpMax: z.ZodNumber;
    atk: z.ZodNumber;
    def: z.ZodNumber;
    spd: z.ZodNumber;
    critChance: z.ZodNumber;
    critMult: z.ZodNumber;
    res: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    hpMax: number;
    atk: number;
    def: number;
    spd: number;
    critChance: number;
    critMult: number;
    res: number;
}, {
    hpMax: number;
    atk: number;
    def: number;
    spd: number;
    critChance: number;
    critMult: number;
    res: number;
}>;
export declare const InventoryStackSchema: z.ZodObject<{
    itemId: z.ZodString;
    qty: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    itemId: string;
    qty: number;
}, {
    itemId: string;
    qty: number;
}>;
export declare const EquipmentSlotsSchema: z.ZodObject<{
    weapon: z.ZodNullable<z.ZodString>;
    armor: z.ZodNullable<z.ZodString>;
    accessory1: z.ZodNullable<z.ZodString>;
    accessory2: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    weapon: string | null;
    armor: string | null;
    accessory1: string | null;
    accessory2: string | null;
}, {
    weapon: string | null;
    armor: string | null;
    accessory1: string | null;
    accessory2: string | null;
}>;
export declare const SkillStateSchema: z.ZodObject<{
    level: z.ZodNumber;
    xp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    level: number;
    xp: number;
}, {
    level: number;
    xp: number;
}>;
export declare const PlayerStateSchema: z.ZodObject<{
    playerId: z.ZodString;
    level: z.ZodNumber;
    xp: z.ZodNumber;
    gold: z.ZodNumber;
    reputation: z.ZodRecord<z.ZodString, z.ZodNumber>;
    baseStats: z.ZodObject<{
        hpMax: z.ZodNumber;
        atk: z.ZodNumber;
        def: z.ZodNumber;
        spd: z.ZodNumber;
        critChance: z.ZodNumber;
        critMult: z.ZodNumber;
        res: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        hpMax: number;
        atk: number;
        def: number;
        spd: number;
        critChance: number;
        critMult: number;
        res: number;
    }, {
        hpMax: number;
        atk: number;
        def: number;
        spd: number;
        critChance: number;
        critMult: number;
        res: number;
    }>;
    skills: z.ZodRecord<z.ZodEnum<["swordsmanship", "archery", "arcana", "defense", "survival", "gathering", "crafting", "diplomacy"]>, z.ZodObject<{
        level: z.ZodNumber;
        xp: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        level: number;
        xp: number;
    }, {
        level: number;
        xp: number;
    }>>;
    tactics: z.ZodEnum<["aggressive", "balanced", "defensive"]>;
}, "strip", z.ZodTypeAny, {
    reputation: Record<string, number>;
    level: number;
    xp: number;
    playerId: string;
    gold: number;
    baseStats: {
        hpMax: number;
        atk: number;
        def: number;
        spd: number;
        critChance: number;
        critMult: number;
        res: number;
    };
    skills: Partial<Record<"swordsmanship" | "arcana" | "defense" | "archery" | "survival" | "gathering" | "crafting" | "diplomacy", {
        level: number;
        xp: number;
    }>>;
    tactics: "aggressive" | "balanced" | "defensive";
}, {
    reputation: Record<string, number>;
    level: number;
    xp: number;
    playerId: string;
    gold: number;
    baseStats: {
        hpMax: number;
        atk: number;
        def: number;
        spd: number;
        critChance: number;
        critMult: number;
        res: number;
    };
    skills: Partial<Record<"swordsmanship" | "arcana" | "defense" | "archery" | "survival" | "gathering" | "crafting" | "diplomacy", {
        level: number;
        xp: number;
    }>>;
    tactics: "aggressive" | "balanced" | "defensive";
}>;
export declare const ActivityPlanSchema: z.ZodObject<{
    activityId: z.ZodString;
    type: z.ZodEnum<["idle", "quest", "hunt", "gather", "craft", "train", "trade", "explore"]>;
    locationId: z.ZodString;
    params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    params: Record<string, any>;
    type: "quest" | "idle" | "hunt" | "craft" | "train" | "trade" | "explore" | "gather";
    activityId: string;
    locationId: string;
}, {
    type: "quest" | "idle" | "hunt" | "craft" | "train" | "trade" | "explore" | "gather";
    activityId: string;
    locationId: string;
    params?: Record<string, any> | undefined;
}>;
export declare const QuestProgressSchema: z.ZodObject<{
    current: z.ZodNumber;
    target: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    current: number;
    target: number;
}, {
    current: number;
    target: number;
}>;
export declare const QuestInstanceSchema: z.ZodObject<{
    id: z.ZodString;
    templateId: z.ZodString;
    status: z.ZodEnum<["active", "completed", "failed"]>;
    locationId: z.ZodString;
    npcId: z.ZodNullable<z.ZodString>;
    progress: z.ZodObject<{
        current: z.ZodNumber;
        target: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        current: number;
        target: number;
    }, {
        current: number;
        target: number;
    }>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "completed" | "failed";
    locationId: string;
    id: string;
    templateId: string;
    npcId: string | null;
    progress: {
        current: number;
        target: number;
    };
}, {
    status: "active" | "completed" | "failed";
    locationId: string;
    id: string;
    templateId: string;
    npcId: string | null;
    progress: {
        current: number;
        target: number;
    };
}>;
export declare const EngineStateSchema: z.ZodObject<{
    version: z.ZodString;
    saveId: z.ZodString;
    createdAtMs: z.ZodNumber;
    updatedAtMs: z.ZodNumber;
    tickIndex: z.ZodNumber;
    nextEventId: z.ZodNumber;
    locationId: z.ZodString;
    activity: z.ZodObject<{
        activityId: z.ZodString;
        type: z.ZodEnum<["idle", "quest", "hunt", "gather", "craft", "train", "trade", "explore"]>;
        locationId: z.ZodString;
        params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        params: Record<string, any>;
        type: "quest" | "idle" | "hunt" | "craft" | "train" | "trade" | "explore" | "gather";
        activityId: string;
        locationId: string;
    }, {
        type: "quest" | "idle" | "hunt" | "craft" | "train" | "trade" | "explore" | "gather";
        activityId: string;
        locationId: string;
        params?: Record<string, any> | undefined;
    }>;
    player: z.ZodObject<{
        playerId: z.ZodString;
        level: z.ZodNumber;
        xp: z.ZodNumber;
        gold: z.ZodNumber;
        reputation: z.ZodRecord<z.ZodString, z.ZodNumber>;
        baseStats: z.ZodObject<{
            hpMax: z.ZodNumber;
            atk: z.ZodNumber;
            def: z.ZodNumber;
            spd: z.ZodNumber;
            critChance: z.ZodNumber;
            critMult: z.ZodNumber;
            res: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            hpMax: number;
            atk: number;
            def: number;
            spd: number;
            critChance: number;
            critMult: number;
            res: number;
        }, {
            hpMax: number;
            atk: number;
            def: number;
            spd: number;
            critChance: number;
            critMult: number;
            res: number;
        }>;
        skills: z.ZodRecord<z.ZodEnum<["swordsmanship", "archery", "arcana", "defense", "survival", "gathering", "crafting", "diplomacy"]>, z.ZodObject<{
            level: z.ZodNumber;
            xp: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            level: number;
            xp: number;
        }, {
            level: number;
            xp: number;
        }>>;
        tactics: z.ZodEnum<["aggressive", "balanced", "defensive"]>;
    }, "strip", z.ZodTypeAny, {
        reputation: Record<string, number>;
        level: number;
        xp: number;
        playerId: string;
        gold: number;
        baseStats: {
            hpMax: number;
            atk: number;
            def: number;
            spd: number;
            critChance: number;
            critMult: number;
            res: number;
        };
        skills: Partial<Record<"swordsmanship" | "arcana" | "defense" | "archery" | "survival" | "gathering" | "crafting" | "diplomacy", {
            level: number;
            xp: number;
        }>>;
        tactics: "aggressive" | "balanced" | "defensive";
    }, {
        reputation: Record<string, number>;
        level: number;
        xp: number;
        playerId: string;
        gold: number;
        baseStats: {
            hpMax: number;
            atk: number;
            def: number;
            spd: number;
            critChance: number;
            critMult: number;
            res: number;
        };
        skills: Partial<Record<"swordsmanship" | "arcana" | "defense" | "archery" | "survival" | "gathering" | "crafting" | "diplomacy", {
            level: number;
            xp: number;
        }>>;
        tactics: "aggressive" | "balanced" | "defensive";
    }>;
    inventory: z.ZodArray<z.ZodObject<{
        itemId: z.ZodString;
        qty: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        itemId: string;
        qty: number;
    }, {
        itemId: string;
        qty: number;
    }>, "many">;
    equipment: z.ZodObject<{
        weapon: z.ZodNullable<z.ZodString>;
        armor: z.ZodNullable<z.ZodString>;
        accessory1: z.ZodNullable<z.ZodString>;
        accessory2: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        weapon: string | null;
        armor: string | null;
        accessory1: string | null;
        accessory2: string | null;
    }, {
        weapon: string | null;
        armor: string | null;
        accessory1: string | null;
        accessory2: string | null;
    }>;
    flags: z.ZodRecord<z.ZodString, z.ZodBoolean>;
    quests: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        templateId: z.ZodString;
        status: z.ZodEnum<["active", "completed", "failed"]>;
        locationId: z.ZodString;
        npcId: z.ZodNullable<z.ZodString>;
        progress: z.ZodObject<{
            current: z.ZodNumber;
            target: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            current: number;
            target: number;
        }, {
            current: number;
            target: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        status: "active" | "completed" | "failed";
        locationId: string;
        id: string;
        templateId: string;
        npcId: string | null;
        progress: {
            current: number;
            target: number;
        };
    }, {
        status: "active" | "completed" | "failed";
        locationId: string;
        id: string;
        templateId: string;
        npcId: string | null;
        progress: {
            current: number;
            target: number;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    locationId: string;
    version: string;
    saveId: string;
    createdAtMs: number;
    updatedAtMs: number;
    tickIndex: number;
    nextEventId: number;
    activity: {
        params: Record<string, any>;
        type: "quest" | "idle" | "hunt" | "craft" | "train" | "trade" | "explore" | "gather";
        activityId: string;
        locationId: string;
    };
    player: {
        reputation: Record<string, number>;
        level: number;
        xp: number;
        playerId: string;
        gold: number;
        baseStats: {
            hpMax: number;
            atk: number;
            def: number;
            spd: number;
            critChance: number;
            critMult: number;
            res: number;
        };
        skills: Partial<Record<"swordsmanship" | "arcana" | "defense" | "archery" | "survival" | "gathering" | "crafting" | "diplomacy", {
            level: number;
            xp: number;
        }>>;
        tactics: "aggressive" | "balanced" | "defensive";
    };
    inventory: {
        itemId: string;
        qty: number;
    }[];
    equipment: {
        weapon: string | null;
        armor: string | null;
        accessory1: string | null;
        accessory2: string | null;
    };
    flags: Record<string, boolean>;
    quests: {
        status: "active" | "completed" | "failed";
        locationId: string;
        id: string;
        templateId: string;
        npcId: string | null;
        progress: {
            current: number;
            target: number;
        };
    }[];
}, {
    locationId: string;
    version: string;
    saveId: string;
    createdAtMs: number;
    updatedAtMs: number;
    tickIndex: number;
    nextEventId: number;
    activity: {
        type: "quest" | "idle" | "hunt" | "craft" | "train" | "trade" | "explore" | "gather";
        activityId: string;
        locationId: string;
        params?: Record<string, any> | undefined;
    };
    player: {
        reputation: Record<string, number>;
        level: number;
        xp: number;
        playerId: string;
        gold: number;
        baseStats: {
            hpMax: number;
            atk: number;
            def: number;
            spd: number;
            critChance: number;
            critMult: number;
            res: number;
        };
        skills: Partial<Record<"swordsmanship" | "arcana" | "defense" | "archery" | "survival" | "gathering" | "crafting" | "diplomacy", {
            level: number;
            xp: number;
        }>>;
        tactics: "aggressive" | "balanced" | "defensive";
    };
    inventory: {
        itemId: string;
        qty: number;
    }[];
    equipment: {
        weapon: string | null;
        armor: string | null;
        accessory1: string | null;
        accessory2: string | null;
    };
    flags: Record<string, boolean>;
    quests: {
        status: "active" | "completed" | "failed";
        locationId: string;
        id: string;
        templateId: string;
        npcId: string | null;
        progress: {
            current: number;
            target: number;
        };
    }[];
}>;
export declare const GameEventBaseSchema: z.ZodObject<{
    id: z.ZodString;
    atMs: z.ZodNumber;
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: string;
    id: string;
    atMs: number;
}, {
    type: string;
    id: string;
    atMs: number;
}>;
export declare const GameEventSchema: z.ZodUnion<[z.ZodObject<{
    id: z.ZodString;
    atMs: z.ZodNumber;
} & {
    type: z.ZodLiteral<"XP_GAINED">;
    data: z.ZodObject<{
        amount: z.ZodNumber;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        amount: number;
        reason: string;
    }, {
        amount: number;
        reason: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "XP_GAINED";
    id: string;
    atMs: number;
    data: {
        amount: number;
        reason: string;
    };
}, {
    type: "XP_GAINED";
    id: string;
    atMs: number;
    data: {
        amount: number;
        reason: string;
    };
}>, z.ZodObject<{
    id: z.ZodString;
    atMs: z.ZodNumber;
} & {
    type: z.ZodLiteral<"ITEM_ADDED">;
    data: z.ZodObject<{
        itemId: z.ZodString;
        qty: z.ZodNumber;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        itemId: string;
        qty: number;
        reason: string;
    }, {
        itemId: string;
        qty: number;
        reason: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "ITEM_ADDED";
    id: string;
    atMs: number;
    data: {
        itemId: string;
        qty: number;
        reason: string;
    };
}, {
    type: "ITEM_ADDED";
    id: string;
    atMs: number;
    data: {
        itemId: string;
        qty: number;
        reason: string;
    };
}>, z.ZodObject<{
    id: z.ZodString;
    atMs: z.ZodNumber;
} & {
    type: z.ZodLiteral<"QUEST_PROGRESS">;
    data: z.ZodObject<{
        questId: z.ZodString;
        current: z.ZodNumber;
        target: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        current: number;
        target: number;
        questId: string;
    }, {
        current: number;
        target: number;
        questId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "QUEST_PROGRESS";
    id: string;
    atMs: number;
    data: {
        current: number;
        target: number;
        questId: string;
    };
}, {
    type: "QUEST_PROGRESS";
    id: string;
    atMs: number;
    data: {
        current: number;
        target: number;
        questId: string;
    };
}>, z.ZodObject<{
    id: z.ZodString;
    atMs: z.ZodNumber;
} & {
    type: z.ZodLiteral<"QUEST_COMPLETED">;
    data: z.ZodObject<{
        questId: z.ZodString;
        templateId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        templateId: string;
        questId: string;
    }, {
        templateId: string;
        questId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "QUEST_COMPLETED";
    id: string;
    atMs: number;
    data: {
        templateId: string;
        questId: string;
    };
}, {
    type: "QUEST_COMPLETED";
    id: string;
    atMs: number;
    data: {
        templateId: string;
        questId: string;
    };
}>]>;
export declare const NarrativeTaskTypeSchema: z.ZodEnum<["quest_flavor", "npc_dialogue", "rumor_feed", "journal_entry"]>;
export declare const NarrativeTaskSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["quest_flavor", "npc_dialogue", "rumor_feed", "journal_entry"]>;
    createdAtMs: z.ZodNumber;
    backendId: z.ZodNullable<z.ZodString>;
    references: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    facts: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    references: Record<string, string>;
    type: "quest_flavor" | "npc_dialogue" | "rumor_feed" | "journal_entry";
    id: string;
    createdAtMs: number;
    backendId: string | null;
    facts: Record<string, any>;
}, {
    type: "quest_flavor" | "npc_dialogue" | "rumor_feed" | "journal_entry";
    id: string;
    createdAtMs: number;
    backendId: string | null;
    facts: Record<string, any>;
    references?: Record<string, string> | undefined;
}>;
export declare const NarrativeBlockSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["quest_flavor", "npc_dialogue", "rumor_feed", "journal_entry"]>;
    createdAtMs: z.ZodNumber;
    references: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    lines: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    references: Record<string, string>;
    type: "quest_flavor" | "npc_dialogue" | "rumor_feed" | "journal_entry";
    id: string;
    createdAtMs: number;
    lines: string[];
    tags: string[];
    title?: string | undefined;
}, {
    type: "quest_flavor" | "npc_dialogue" | "rumor_feed" | "journal_entry";
    id: string;
    createdAtMs: number;
    references?: Record<string, string> | undefined;
    title?: string | undefined;
    lines?: string[] | undefined;
    tags?: string[] | undefined;
}>;
export type EngineStateDTO = z.infer<typeof EngineStateSchema>;
export type GameEventDTO = z.infer<typeof GameEventSchema>;
export type NarrativeTaskDTO = z.infer<typeof NarrativeTaskSchema>;
export type NarrativeBlockDTO = z.infer<typeof NarrativeBlockSchema>;
//# sourceMappingURL=schemas.d.ts.map