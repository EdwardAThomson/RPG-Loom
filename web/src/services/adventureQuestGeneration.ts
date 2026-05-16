/**
 * Adventure Quest Generation Service
 * 
 * Handles AI-generated multi-location adventure quests using template-based steps.
 */

import type { ContentIndex, LocationId, AdventureStepTemplate } from '@rpg-loom/shared';
import { getAISettings } from './aiSettings';
import { gatewayFetch, isGatewayAvailable } from './gateway';

export interface AdventureQuestSpec {
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
        items?: Array<{ itemId: string; qty: number }>;
    };
}

/**
 * Generate an AI adventure quest
 */
export async function generateAdventureQuest(
    currentLocationId: LocationId,
    playerLevel: number,
    content: ContentIndex
): Promise<AdventureQuestSpec> {
    if (isGatewayAvailable() === false) {
        throw new Error('AI gateway is not available');
    }

    const settings = getAISettings();
    const prompt = buildAdventurePrompt(currentLocationId, playerLevel, content);

    const response = await gatewayFetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: settings.provider,
            model: settings.model,
            prompt,
            maxTokens: 1200,
            temperature: 0.9
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate adventure quest');
    }

    const { text } = await response.json();
    return parseAdventureSpec(text, playerLevel, content);
}

/**
 * Build prompt for adventure generation
 */
function buildAdventurePrompt(
    currentLocationId: LocationId,
    playerLevel: number,
    content: ContentIndex
): string {
    const currentLocation = content.locationsById[currentLocationId];

    // Get available locations for the player's level
    const availableLocations = Object.values(content.locationsById)
        .filter(loc => {
            const minLevel = loc.requirements?.minLevel || 0;
            return minLevel <= playerLevel + 5;
        })
        .map(loc => `${loc.name} (${loc.id})`)
        .slice(0, 8);

    // Get enemies for kill quests
    const enemies = Object.values(content.enemiesById)
        .filter(e => e.levelMin <= playerLevel + 3)
        .map(e => `${e.name} (${e.id})`)
        .slice(0, 12);

    // Get items for gather/deliver quests
    const items = Object.values(content.itemsById)
        .filter(i => i.type !== 'quest')
        .map(i => `${i.name} (${i.id})`)
        .slice(0, 15);

    // Get recipes for craft quests
    const recipes = Object.values(content.recipesById)
        .map(r => `${r.name} (${r.id})`)
        .slice(0, 10);

    return `You are a quest designer for a dark fantasy RPG. Generate an engaging multi-step adventure quest using QUEST TEMPLATES.

Context:
- Starting Location: ${currentLocation?.name || currentLocationId}
- Player Level: ${playerLevel}
- Available Locations: ${availableLocations.join(', ')}
- Available Enemies: ${enemies.join(', ')}
- Available Items: ${items.join(', ')}
- Available Recipes: ${recipes.join(', ')}

QUEST TEMPLATES (choose from these for each step):
1. kill: { "type": "kill", "targetEnemyId": "enemy_id", "qty": number }
2. gather: { "type": "gather", "targetItemId": "item_id", "qty": number }
3. travel: { "type": "travel", "targetLocationId": "loc_id" }
4. explore: { "type": "explore", "targetLocationId": "loc_id", "durationMs": 30000-60000 }
5. craft: { "type": "craft", "targetRecipeId": "recipe_id", "qty": 1 }
6. deliver: { "type": "deliver", "targetItemId": "item_id", "targetLocationId": "loc_id", "qty": number }

Create a 3-5 step adventure that:
1. Has a coherent narrative arc (beginning, middle, end)
2. Uses dark fantasy themes (mystery, danger, ancient secrets)
3. Mixes different template types for variety
4. Provides appropriate rewards for difficulty and player level
5. Uses ONLY IDs from the available resources above

Example adventure structure:
{
  "title": "The Sunken King's Awakening",
  "description": "An ancient spectral presence has begun to stir within the depths of the earth.",
  "steps": [
    {
      "stepNumber": 1,
      "template": {
        "type": "explore",
        "targetLocationId": "loc_catacombs",
        "durationMs": 30000
      },
      "narrative": {
        "description": "Investigate the desecrated altar in the Forgotten Catacombs",
        "context": "Blue spectral flames have been spotted emanating from the ancient altar"
      }
    },
    {
      "stepNumber": 2,
      "template": {
        "type": "gather",
        "targetItemId": "item_ghostly_essence",
        "qty": 3
      },
      "narrative": {
        "description": "Collect ghostly essence from the Wailing Ghosts",
        "context": "The essence is needed to track the source of the disturbance"
      }
    },
    {
      "stepNumber": 3,
      "template": {
        "type": "kill",
        "targetEnemyId": "enemy_skeleton",
        "qty": 5
      },
      "narrative": {
        "description": "Banish the risen skeletons guarding the inner sanctum",
        "context": "The Sunken King's servants have awakened to protect their master"
      }
    }
  ],
  "difficulty": 3,
  "rewards": {
    "xp": 500,
    "gold": 250,
    "items": [{"itemId": "item_silver_ore", "qty": 3}]
  }
}

IMPORTANT: Return ONLY valid JSON (no markdown, no code blocks). Ensure all IDs exist in the available resources.`;
}

/**
 * Validate a step's template against the content pack. Returns the
 * normalised template if every referenced ID exists, or null if any
 * required ID is missing — closes the highest-impact gap in
 * `docs/known_gaps.md` §3 ("E4 — no invented IDs"), where an AI-invented
 * id would produce a sub-quest the engine can never progress.
 */
function validateStepTemplate(template: any, content: ContentIndex): AdventureStepTemplate | null {
    if (!template || typeof template !== 'object') return null;
    switch (template.type) {
        case 'kill': {
            const enemyId = String(template.targetEnemyId ?? '');
            const qty = Number(template.qty);
            if (!enemyId || !content.enemiesById[enemyId]) return null;
            if (!Number.isFinite(qty) || qty < 1) return null;
            return { type: 'kill', targetEnemyId: enemyId, qty: Math.floor(qty) };
        }
        case 'gather': {
            const itemId = String(template.targetItemId ?? '');
            const qty = Number(template.qty);
            if (!itemId || !content.itemsById[itemId]) return null;
            if (!Number.isFinite(qty) || qty < 1) return null;
            return { type: 'gather', targetItemId: itemId, qty: Math.floor(qty) };
        }
        case 'travel': {
            const locationId = String(template.targetLocationId ?? '');
            if (!locationId || !content.locationsById[locationId]) return null;
            return { type: 'travel', targetLocationId: locationId };
        }
        case 'explore': {
            const locationId = String(template.targetLocationId ?? '');
            const durationMs = Number(template.durationMs ?? 30000);
            if (!locationId || !content.locationsById[locationId]) return null;
            if (!Number.isFinite(durationMs) || durationMs < 1000) return null;
            return { type: 'explore', targetLocationId: locationId, durationMs: Math.floor(durationMs) };
        }
        case 'craft': {
            const recipeId = String(template.targetRecipeId ?? '');
            const qty = Number(template.qty);
            if (!recipeId || !content.recipesById[recipeId]) return null;
            if (!Number.isFinite(qty) || qty < 1) return null;
            return { type: 'craft', targetRecipeId: recipeId, qty: Math.floor(qty) };
        }
        case 'deliver': {
            const itemId = String(template.targetItemId ?? '');
            const locationId = String(template.targetLocationId ?? '');
            const qty = Number(template.qty);
            if (!itemId || !content.itemsById[itemId]) return null;
            if (!locationId || !content.locationsById[locationId]) return null;
            if (!Number.isFinite(qty) || qty < 1) return null;
            return { type: 'deliver', targetItemId: itemId, targetLocationId: locationId, qty: Math.floor(qty) };
        }
        default:
            return null;
    }
}

/**
 * Build a 2–3 step adventure from whatever the content pack actually
 * contains, so the fallback path doesn't depend on hardcoded IDs that
 * might be renamed/removed (the other half of `known_gaps.md` §3).
 *
 * Conservative — prefers low-level enemies and locations without
 * requirements gates so the fallback works for a fresh save.
 */
function buildSafeFallback(content: ContentIndex, playerLevel: number): AdventureQuestSpec {
    const locations = Object.values(content.locationsById);
    const enemies = Object.values(content.enemiesById);

    // Prefer ungated locations; if none, take any location.
    const safeLocations = locations.filter(l => !l.requirements);
    const exploreLocation = safeLocations[0] ?? locations[0];
    // Prefer a different location for the "return" step so the player travels.
    const returnLocation = (safeLocations.find(l => l.id !== exploreLocation?.id) ?? safeLocations[0] ?? locations[0]);
    // Pick the lowest-level enemy available.
    const targetEnemy = [...enemies].sort((a, b) => (a.levelMin ?? 1) - (b.levelMin ?? 1))[0];

    const steps: AdventureQuestSpec['steps'] = [];
    if (exploreLocation) {
        steps.push({
            stepNumber: steps.length + 1,
            template: { type: 'explore', targetLocationId: exploreLocation.id, durationMs: 30000 },
            narrative: { description: `Explore ${exploreLocation.name}` }
        });
    }
    if (targetEnemy) {
        steps.push({
            stepNumber: steps.length + 1,
            template: { type: 'kill', targetEnemyId: targetEnemy.id, qty: 3 },
            narrative: { description: `Face the challenge ahead` }
        });
    }
    if (returnLocation && returnLocation.id !== exploreLocation?.id) {
        steps.push({
            stepNumber: steps.length + 1,
            template: { type: 'travel', targetLocationId: returnLocation.id },
            narrative: { description: `Return to ${returnLocation.name}` }
        });
    }

    const levelMultiplier = Math.max(1, playerLevel / 10);
    return {
        title: 'A Simple Quest',
        description: 'Sometimes the simplest quests are the most rewarding.',
        steps,
        difficulty: 2,
        rewards: {
            xp: Math.floor(200 * levelMultiplier),
            gold: Math.floor(100 * levelMultiplier)
        }
    };
}

/**
 * Parse AI response into adventure spec. Drops steps that reference
 * IDs not present in the content pack; if every step is invalid (or
 * the JSON itself fails to parse), returns a fallback built from
 * content rather than hardcoded IDs.
 *
 * Exported for unit tests; production code goes through
 * `generateAdventureQuest`.
 */
export function parseAdventureSpec(text: string, playerLevel: number, content: ContentIndex): AdventureQuestSpec {
    const levelMultiplier = Math.max(1, playerLevel / 10);
    let parsed: any;
    try {
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
        parsed = JSON.parse(cleaned);
    } catch (error) {
        console.error('Failed to parse adventure spec:', error);
        console.error('Raw text:', text);
        return buildSafeFallback(content, playerLevel);
    }

    const rawSteps: any[] = Array.isArray(parsed?.steps) ? parsed.steps : [];
    const validSteps: AdventureQuestSpec['steps'] = [];
    let droppedCount = 0;
    for (let idx = 0; idx < rawSteps.length; idx++) {
        const s = rawSteps[idx];
        const validatedTemplate = validateStepTemplate(s?.template, content);
        if (!validatedTemplate) {
            droppedCount++;
            console.warn('[adventureQuest] dropped step with invalid IDs:', s?.template);
            continue;
        }
        validSteps.push({
            stepNumber: validSteps.length + 1,
            template: validatedTemplate,
            narrative: {
                description: s?.narrative?.description || s?.description || 'Continue the adventure',
                context: s?.narrative?.context
            }
        });
    }

    if (validSteps.length === 0) {
        if (droppedCount > 0) {
            console.warn(`[adventureQuest] all ${droppedCount} step(s) had invalid IDs; falling back`);
        }
        return buildSafeFallback(content, playerLevel);
    }

    const baseXp = typeof parsed?.rewards?.xp === 'number' ? parsed.rewards.xp : 300;
    const baseGold = typeof parsed?.rewards?.gold === 'number' ? parsed.rewards.gold : 150;
    const difficulty = (parsed?.difficulty >= 1 && parsed?.difficulty <= 5) ? parsed.difficulty : 3;

    // Reward items reference itemIds — validate too. AI-invented item
    // rewards would silently never appear in the player's inventory.
    const rawItems = Array.isArray(parsed?.rewards?.items) ? parsed.rewards.items : [];
    const validItems = rawItems.filter((it: any) =>
        it && typeof it.itemId === 'string' && content.itemsById[it.itemId] &&
        typeof it.qty === 'number' && it.qty > 0
    ).map((it: any) => ({ itemId: it.itemId, qty: Math.floor(it.qty) }));

    return {
        title: typeof parsed?.title === 'string' ? parsed.title : 'Mysterious Adventure',
        description: typeof parsed?.description === 'string' ? parsed.description : 'An adventure awaits...',
        steps: validSteps,
        difficulty: difficulty as 1 | 2 | 3 | 4 | 5,
        rewards: {
            xp: Math.floor(baseXp * levelMultiplier),
            gold: Math.floor(baseGold * levelMultiplier),
            items: validItems
        }
    };
}
