/**
 * Quest Enhancement Service
 * 
 * Handles AI-generated narrative enhancement for quests.
 */

import type { QuestInstanceState, QuestTemplateDef, ContentIndex } from '@rpg-loom/shared';

const API_URL = 'http://localhost:8787';

export interface QuestNarrative {
    title?: string;
    description?: string;
    flavorText?: string;
}

/**
 * Enhance a quest with AI-generated narrative
 */
export async function enhanceQuest(
    quest: QuestInstanceState,
    template: QuestTemplateDef,
    content: ContentIndex,
    provider: string = 'gemini-cli',
    model?: string
): Promise<QuestNarrative> {
    const prompt = buildQuestEnhancementPrompt(quest, template, content);

    const response = await fetch(`${API_URL}/api/llm/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider,
            model: model || 'gemini-3-flash-preview',
            prompt,
            maxTokens: 300,
            temperature: 0.8
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate quest narrative');
    }

    const { text } = await response.json();
    return parseQuestNarrative(text);
}

/**
 * Build prompt for quest enhancement
 */
function buildQuestEnhancementPrompt(
    quest: QuestInstanceState,
    template: QuestTemplateDef,
    content: ContentIndex
): string {
    const location = content.locationsById[quest.locationId];
    const targetDesc = getTargetDescription(template, content);

    return `You are a fantasy quest writer. Enhance this quest with engaging narrative.

Quest Type: ${template.objectiveType}
Target: ${targetDesc}
Quantity: ${quest.progress.required}
Location: ${location?.name || quest.locationId}
Difficulty: ${'⭐'.repeat(template.difficulty)}

Generate a compelling quest with:
1. An engaging title (max 60 characters)
2. A vivid description (2-3 sentences)
3. Optional flavor text (1 sentence, mysterious or intriguing)

Format as JSON:
{
  "title": "...",
  "description": "...",
  "flavorText": "..."
}

Keep the tone dark fantasy, mysterious, and immersive. Focus on atmosphere and stakes.`;
}

/**
 * Get human-readable target description
 */
function getTargetDescription(template: QuestTemplateDef, content: ContentIndex): string {
    switch (template.objectiveType) {
        case 'kill':
            if (template.targetEnemyId) {
                const enemy = content.enemiesById[template.targetEnemyId];
                return enemy?.name || template.targetEnemyId;
            }
            return 'enemies';

        case 'gather':
            if (template.targetItemId) {
                const item = content.itemsById[template.targetItemId];
                return item?.name || template.targetItemId;
            }
            return 'items';

        case 'craft':
            if (template.targetRecipeId) {
                const recipe = content.recipesById[template.targetRecipeId];
                return recipe?.name || template.targetRecipeId;
            }
            return 'items';

        case 'explore':
            if (template.targetLocationId) {
                const loc = content.locationsById[template.targetLocationId];
                return loc?.name || template.targetLocationId;
            }
            return 'location';

        default:
            return template.objectiveType;
    }
}

/**
 * Parse AI response into quest narrative
 */
function parseQuestNarrative(text: string): QuestNarrative {
    try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                title: parsed.title || undefined,
                description: parsed.description || undefined,
                flavorText: parsed.flavorText || parsed.flavor || undefined
            };
        }

        // Fallback: treat as plain text description
        return {
            description: text.trim()
        };
    } catch (error) {
        console.error('Failed to parse quest narrative:', error);
        // Return text as description
        return {
            description: text.trim()
        };
    }
}
