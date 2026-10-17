import type { ActivityParams, EngineState, SkillId } from '@rpg-loom/shared';
import { getTotalXpForSkillLevel } from '@rpg-loom/engine';

// One place for player-facing names, so the log, character sheet and
// HUD stop disagreeing ("Smithing" vs "Blacksmithing", "Melee" vs
// "Swordsmanship").
export const SKILL_NAMES: Record<SkillId, string> = {
    swordsmanship: 'Swordsmanship',
    marksmanship: 'Marksmanship',
    arcana: 'Arcana',
    defense: 'Defense',
    blacksmithing: 'Smithing',
    woodworking: 'Woodworking',
    leatherworking: 'Leatherworking',
    mining: 'Mining',
    woodcutting: 'Woodcutting',
    foraging: 'Foraging'
};

export function skillName(id: string): string {
    return SKILL_NAMES[id as SkillId] ?? humanize(id);
}

/** `scout_captain` / `ENCOUNTER_STARTED` → "Scout captain" / "Encounter started". */
export function humanize(raw: string): string {
    const s = raw.replace(/^(item|enemy|loc|npc|recipe)_/, '').replace(/_/g, ' ').toLowerCase().trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function itemName(content: any, itemId: string): string {
    return content?.itemsById?.[itemId]?.name ?? humanize(itemId);
}

export function enemyName(content: any, enemyId: string): string {
    return content?.enemiesById?.[enemyId]?.name ?? humanize(enemyId);
}

/** Mirrors the engine's weapon → combat skill mapping in resolveEncounterTick. */
export function weaponSkill(state: EngineState, content: any): SkillId {
    const weaponId = state.equipment.weapon;
    const tags: string[] = (weaponId && content?.itemsById?.[weaponId]?.tags) || [];
    if (tags.includes('bow')) return 'marksmanship';
    if (tags.includes('wand') || tags.includes('staff')) return 'arcana';
    return 'swordsmanship';
}

/** The skill an activity trains, if any. */
export function activitySkill(params: ActivityParams, state: EngineState, content: any): SkillId | null {
    switch (params.type) {
        case 'woodcut': return 'woodcutting';
        case 'mine': return 'mining';
        case 'forage': return 'foraging';
        case 'train': return params.skillId;
        case 'hunt': return weaponSkill(state, content);
        case 'craft': return content?.recipesById?.[params.recipeId]?.skill ?? null;
        default: return null;
    }
}

export function activityLabel(params: ActivityParams, content: any): string {
    switch (params.type) {
        case 'idle': return 'Idle';
        case 'recovery': return 'Resting';
        case 'hunt': return 'Hunting';
        case 'mine': return 'Mining';
        case 'woodcut': return 'Woodcutting';
        case 'forage': return 'Foraging';
        case 'trade': return 'At the market';
        case 'explore': return 'Exploring';
        case 'train': return `Training ${skillName(params.skillId)}`;
        case 'craft': return `Crafting ${content?.recipesById?.[params.recipeId]?.name ?? 'an item'}`;
        case 'quest':
        case 'adventure': return 'On a quest';
    }
}

/** Progress through the current level, for XP bars. */
export function skillProgress(xp: number, level: number) {
    const start = getTotalXpForSkillLevel(level);
    const next = getTotalXpForSkillLevel(level + 1);
    const into = Math.max(0, xp - start);
    const span = Math.max(1, next - start);
    return { into: Math.floor(into), span, pct: Math.min(100, (into / span) * 100) };
}
