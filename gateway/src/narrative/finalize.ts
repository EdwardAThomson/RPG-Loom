import { v4 as uuidv4 } from 'uuid';
import type { ContentIndex, NarrativeBlockDTO, NarrativeTaskDTO } from '@rpg-loom/shared';

// Length budgets enforced by finalizeBlock — the third leg of E4
// alongside the no-invented-IDs validator. AI runs occasionally
// produce a paragraph per "line"; we trim to keep the UI readable
// and the journal store light.
export const MAX_LINES = 6;
export const MAX_CHARS_PER_LINE = 240;
export const MAX_CHARS_TOTAL = 1200;
export const MAX_TAGS = 8;
export const MAX_TITLE_CHARS = 80;

// Prefixes the AI uses for ID tokens in our content pack. Anything
// matching `<prefix>_<rest>` in narrative text is treated as a claim
// that an ID exists. Each prefix maps to:
//   - the lookup map on ContentIndex used to verify the ID, and
//   - a generic placeholder substituted when the ID is invented.
const ID_PREFIX_TO_LOOKUP: Record<string, { map: keyof ContentIndex; placeholder: string }> = {
    item: { map: 'itemsById', placeholder: 'an item' },
    enemy: { map: 'enemiesById', placeholder: 'a creature' },
    loc: { map: 'locationsById', placeholder: 'the area' },
    npc: { map: 'npcsById', placeholder: 'a figure' },
    recipe: { map: 'recipesById', placeholder: 'a recipe' }
};

// Token regex: a known prefix followed by an underscore and an
// id-looking suffix. Word boundaries prevent matching inside longer
// identifiers and prevent partial matches inside other words.
const ID_TOKEN_RE = /\b(item|enemy|loc|npc|recipe)_[a-z][a-z0-9_]*\b/g;

/**
 * Replace ID-shaped tokens in free narrative text:
 *   - Valid IDs (found in `content`) → swap in the entity's human name,
 *     so AI prose like "Bring back item_wood" reads as "Bring back Wood".
 *   - Invented IDs (not in `content`) → swap in a generic placeholder
 *     ("an item", "a creature", etc.) so the AI can't sneak a
 *     hallucinated entity into the player UI.
 *
 * Idempotent: running twice produces the same output. Returns the
 * original string unchanged when no content pack is supplied (lets
 * tests focus on length-budget logic without a fixture).
 */
export function sanitizeNarrativeText(text: string, content?: ContentIndex): string {
    if (!content) return text;
    return text.replace(ID_TOKEN_RE, (match, prefix: string) => {
        const lookup = ID_PREFIX_TO_LOOKUP[prefix];
        if (!lookup) return match;
        const entry = (content[lookup.map] as Record<string, { name?: string }>)?.[match];
        if (entry?.name) return entry.name;
        return lookup.placeholder;
    });
}

export function applyLengthBudget(rawLines: unknown): string[] {
    const arr = Array.isArray(rawLines)
        ? rawLines.map(String)
        : rawLines !== undefined && rawLines !== null
            ? [String(rawLines)]
            : [];

    const truncatedPerLine = arr
        .map(l => l.length > MAX_CHARS_PER_LINE
            ? l.slice(0, MAX_CHARS_PER_LINE - 1).trimEnd() + '…'
            : l)
        .filter(Boolean)
        .slice(0, MAX_LINES);

    // Drop trailing lines once the total budget is exhausted.
    const result: string[] = [];
    let total = 0;
    for (const l of truncatedPerLine) {
        if (total + l.length > MAX_CHARS_TOTAL) break;
        result.push(l);
        total += l.length;
    }
    return result;
}

export function finalizeBlock(obj: any, task: NarrativeTaskDTO, content?: ContentIndex): NarrativeBlockDTO {
    const rawTitle = typeof obj.title === 'string' ? obj.title : undefined;
    const sanitizedTitle = rawTitle !== undefined ? sanitizeNarrativeText(rawTitle, content) : undefined;
    const title = sanitizedTitle !== undefined && sanitizedTitle.length > MAX_TITLE_CHARS
        ? sanitizedTitle.slice(0, MAX_TITLE_CHARS - 1).trimEnd() + '…'
        : sanitizedTitle;

    // Sanitize line content first, then apply the length budget — order
    // matters because sanitization can change length (an invented
    // enemy_dragon → "a creature" is shorter; item_wood → "Wood" is
    // shorter too). Sanitizing before budgeting keeps the cap accurate.
    const rawLines = Array.isArray(obj.lines) ? obj.lines : obj.lines;
    const sanitizedLines = Array.isArray(rawLines)
        ? rawLines.map(l => sanitizeNarrativeText(String(l), content))
        : rawLines;

    // When the AI didn't return any tags, fall back to a one-tag
    // attribution of which backend produced the block. Previously
    // hardcoded 'gemini' regardless of provider.
    const fallbackTag = task.backendId ?? 'unknown';

    return {
        id: typeof obj.id === 'string' ? obj.id : uuidv4(),
        type: task.type,
        createdAtMs: typeof obj.createdAtMs === 'number' ? obj.createdAtMs : Date.now(),
        references: task.references ?? {},
        title,
        lines: applyLengthBudget(sanitizedLines),
        tags: Array.isArray(obj.tags) ? obj.tags.map(String).slice(0, MAX_TAGS) : [fallbackTag]
    };
}
