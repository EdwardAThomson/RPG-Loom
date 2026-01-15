/**
 * Adventure Quest Generation Service
 * 
 * Handles AI-generated multi-location adventure quests using template-based steps.
 */

import type { ContentIndex, LocationId, AdventureStepTemplate } from '@rpg-loom/shared';
import { getAISettings } from './aiSettings';

const API_URL = 'http://localhost:8787';

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
    const settings = getAISettings();
    const prompt = buildAdventurePrompt(currentLocationId, playerLevel, content);

    const response = await fetch(`${API_URL}/api/llm/generate`, {
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
    return parseAdventureSpec(text, playerLevel);
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
 * Parse AI response into adventure spec
 */
function parseAdventureSpec(text: string, playerLevel: number): AdventureQuestSpec {
    try {
        // Remove markdown code blocks if present
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

        const parsed = JSON.parse(cleaned);

        // Validate and normalize steps
        const steps = (parsed.steps || []).map((s: any, idx: number) => ({
            stepNumber: s.stepNumber || idx + 1,
            template: s.template || { type: 'explore', targetLocationId: 'loc_forest', durationMs: 30000 },
            narrative: {
                description: s.narrative?.description || s.description || 'Continue the adventure',
                context: s.narrative?.context
            }
        }));

        // Scale rewards based on player level
        const baseXp = parsed.rewards?.xp || 300;
        const baseGold = parsed.rewards?.gold || 150;
        const levelMultiplier = Math.max(1, playerLevel / 10);

        return {
            title: parsed.title || 'Mysterious Adventure',
            description: parsed.description || 'An adventure awaits...',
            steps,
            difficulty: parsed.difficulty || 3,
            rewards: {
                xp: Math.floor(baseXp * levelMultiplier),
                gold: Math.floor(baseGold * levelMultiplier),
                items: parsed.rewards?.items || []
            }
        };
    } catch (error) {
        console.error('Failed to parse adventure spec:', error);
        console.error('Raw text:', text);

        // Fallback adventure with template-based steps
        return {
            title: 'A Simple Quest',
            description: 'Sometimes the simplest quests are the most rewarding.',
            steps: [
                {
                    stepNumber: 1,
                    template: { type: 'explore', targetLocationId: 'loc_forest', durationMs: 30000 },
                    narrative: { description: 'Explore the area and gather your courage' }
                },
                {
                    stepNumber: 2,
                    template: { type: 'kill', targetEnemyId: 'enemy_rat', qty: 3 },
                    narrative: { description: 'Face the challenge ahead' }
                },
                {
                    stepNumber: 3,
                    template: { type: 'travel', targetLocationId: 'loc_haven' },
                    narrative: { description: 'Return victorious' }
                }
            ],
            difficulty: 2,
            rewards: {
                xp: 200 * Math.max(1, playerLevel / 10),
                gold: 100 * Math.max(1, playerLevel / 10)
            }
        };
    }
}
