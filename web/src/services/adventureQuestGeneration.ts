/**
 * Adventure Quest Generation Service
 * 
 * Handles AI-generated multi-location adventure quests.
 */

import type { ContentIndex, LocationId } from '@rpg-loom/shared';
import { getAISettings } from './aiSettings';

const API_URL = 'http://localhost:8787';

export interface AdventureQuestSpec {
    title: string;
    description: string;
    steps: Array<{
        stepNumber: number;
        description: string;
        locationId?: string;
    }>;
    estimatedDurationMs: number;
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
            maxTokens: 800,
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
            return minLevel <= playerLevel + 5; // Include slightly higher level areas
        })
        .map(loc => `${loc.name} (${loc.id})`)
        .slice(0, 8); // Limit to prevent token overflow

    // Get some enemies for context
    const enemies = Object.values(content.enemiesById)
        .filter(e => e.levelMin <= playerLevel + 3)
        .map(e => e.name)
        .slice(0, 10);

    // Get some items for rewards
    const items = Object.values(content.itemsById)
        .filter(i => i.type !== 'quest')
        .map(i => `${i.name} (${i.id})`)
        .slice(0, 15);

    return `You are a quest designer for a dark fantasy RPG. Generate an engaging multi-location adventure quest.

Context:
- Starting Location: ${currentLocation?.name || currentLocationId}
- Player Level: ${playerLevel}
- Available Locations: ${availableLocations.join(', ')}
- Example Enemies: ${enemies.join(', ')}
- Example Items for Rewards: ${items.join(', ')}

Create a multi-step adventure quest (3-5 steps) that:
1. Has an engaging narrative arc with a clear beginning, middle, and end
2. Can span multiple locations (but doesn't have to - single location is fine too)
3. Takes 2-5 minutes to complete (120000-300000 milliseconds)
4. Provides appropriate rewards for difficulty and player level
5. Feels like a real adventure, not just "collect 5 items"
6. Uses dark fantasy themes: mystery, danger, ancient secrets, moral choices

Examples of good multi-location adventures:
- "Track bandits from Whispering Forest → Old Quarry → back to Haven's Cross"
- "Investigate mysterious ruins in Forgotten Catacombs → report to scholars"
- "Gather rare components in Misty Swamp → craft ritual item → perform ceremony"

Each step can optionally specify a locationId. If no locationId is specified, the step can be completed at the current location.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "title": "The Bandit Trail",
  "description": "Track down a group of bandits terrorizing the trade routes and bring them to justice.",
  "steps": [
    {
      "stepNumber": 1,
      "description": "Search for clues in the forest undergrowth",
      "locationId": "loc_forest"
    },
    {
      "stepNumber": 2,
      "description": "Follow the trail to the quarry where the bandits hide"
    },
    {
      "stepNumber": 3,
      "description": "Confront the bandit leader in their hideout"
    },
    {
      "stepNumber": 4,
      "description": "Return to Haven's Cross and report your success",
      "locationId": "loc_haven"
    }
  ],
  "estimatedDurationMinutes": 4,
  "difficulty": 3,
  "rewards": {
    "xp": 500,
    "gold": 200,
    "items": [{"itemId": "item_leather_tunic", "qty": 1}]
  }
}

IMPORTANT: Return ONLY the JSON object, no other text.`;
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

        // Convert estimatedDurationMinutes to milliseconds
        const durationMs = (parsed.estimatedDurationMinutes || 3) * 60 * 1000;

        // Scale rewards based on player level if needed
        const baseXp = parsed.rewards?.xp || 300;
        const baseGold = parsed.rewards?.gold || 150;
        const levelMultiplier = Math.max(1, playerLevel / 10);

        return {
            title: parsed.title || 'Mysterious Adventure',
            description: parsed.description || 'An adventure awaits...',
            steps: (parsed.steps || []).map((s: any, idx: number) => ({
                stepNumber: s.stepNumber || idx + 1,
                description: s.description || 'Continue the adventure',
                locationId: s.locationId || undefined
            })),
            estimatedDurationMs: durationMs,
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

        // Fallback adventure
        return {
            title: 'A Simple Quest',
            description: 'Sometimes the simplest quests are the most rewarding.',
            steps: [
                { stepNumber: 1, description: 'Explore the area and gather your courage' },
                { stepNumber: 2, description: 'Face the challenge ahead' },
                { stepNumber: 3, description: 'Return victorious' }
            ],
            estimatedDurationMs: 180000,
            difficulty: 2,
            rewards: {
                xp: 200 * Math.max(1, playerLevel / 10),
                gold: 100 * Math.max(1, playerLevel / 10)
            }
        };
    }
}
