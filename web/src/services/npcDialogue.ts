/**
 * NPC dialogue generation (Phase 3c).
 *
 * Builds a JSON-only prompt from an NPC's authored seed (role,
 * prompts, location) plus a small bit of player context (level,
 * affinity, recent events), sends it through the gateway's existing
 * /api/llm/generate endpoint, and parses the structured response into
 * a `{ description, dialogueLines }` flavor object.
 *
 * The caller (the modal) is expected to dispatch `SET_NPC_FLAVOR` with
 * the result so the engine caches it on `npcState[npcId].generatedFlavor`.
 * Subsequent visits read from that cache without re-hitting the AI.
 */

import type { ContentIndex, EngineState, GameEvent, NpcDef } from '@rpg-loom/shared';
import { gatewayFetch, isGatewayAvailable } from './gateway';
import { getAISettings } from './aiSettings';

export interface NpcGeneratedFlavor {
    description: string;
    dialogueLines: string[];
}

export async function generateNpcDialogue(
    npc: NpcDef,
    state: EngineState,
    content: ContentIndex,
    recentEvents: GameEvent[]
): Promise<NpcGeneratedFlavor> {
    if (isGatewayAvailable() === false) {
        throw new Error('AI gateway is not available');
    }

    const settings = getAISettings();
    const prompt = buildNpcDialoguePrompt(npc, state, content, recentEvents);

    const response = await gatewayFetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: settings.provider,
            model: settings.model,
            prompt,
            maxTokens: 500,
            temperature: 0.85
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Failed to generate NPC dialogue (${response.status})`);
    }

    const { text } = await response.json() as { text: string };
    return parseNpcFlavor(text, npc);
}

function buildNpcDialoguePrompt(
    npc: NpcDef,
    state: EngineState,
    content: ContentIndex,
    recentEvents: GameEvent[]
): string {
    const location = content.locationsById[npc.locationId];
    const entry = state.npcState?.[npc.id];
    const affinity = entry?.affinity ?? 0;
    const haveMet = entry?.firstMetAtMs !== undefined;

    // Distill recent events down to a small list of human-readable
    // facts. The AI doesn't need raw ids, just "what happened lately."
    const recentLines: string[] = [];
    for (const e of recentEvents.slice(-10)) {
        if (e.type === 'QUEST_COMPLETED') {
            const tmpl = content.questTemplatesById[(e.payload as any).templateId];
            if (tmpl?.name) recentLines.push(`Completed quest: ${tmpl.name}`);
        } else if (e.type === 'ENCOUNTER_RESOLVED') {
            const p = e.payload as any;
            if (p.outcome === 'win') {
                const enemy = content.enemiesById[p.enemyId];
                recentLines.push(`Defeated ${enemy?.name ?? p.enemyId}`);
            }
        } else if (e.type === 'LEVEL_UP') {
            recentLines.push(`Reached level ${(e.payload as any).newLevel}`);
        }
    }

    const seed = npc.prompts ?? {};
    const seedLines: string[] = [];
    if (seed.topic) seedLines.push(`About them: ${seed.topic}`);
    if (seed.greeting) seedLines.push(`Their usual greeting: "${seed.greeting}"`);
    if (seed.questIntro) seedLines.push(`How they pitch work: "${seed.questIntro}"`);

    return [
        `You are writing the persistent voice of a single NPC in a dark-fantasy idle RPG.`,
        `This output will be cached and reused for the next several visits — so write lines that fit who they are, not what they're doing right this second.`,
        ``,
        `NPC:`,
        `  name: ${npc.name}`,
        `  role: ${npc.role.replace(/_/g, ' ')}`,
        `  location: ${location?.name ?? npc.locationId}`,
        ...seedLines.map(l => `  ${l}`),
        ``,
        `Player context:`,
        `  level: ${state.player.level}`,
        `  affinity with this NPC: ${affinity} / 100`,
        `  status: ${haveMet ? 'returning visitor' : 'first meeting'}`,
        recentLines.length > 0 ? `  recently: ${recentLines.join('; ')}` : `  no notable events yet`,
        ``,
        `Write a JSON object with exactly this shape:`,
        `{`,
        `  "description": "<one or two sentences of third-person description of their bearing right now (what they're doing, how they look). 220 chars max.>",`,
        `  "dialogueLines": [`,
        `    "<line they might say in first person, in quotes if helpful for the actor. 150 chars max each. 2-4 lines total. Should sound like the seed greeting, not a totally different character.>"`,
        `  ]`,
        `}`,
        ``,
        `Rules:`,
        `- Return ONLY the JSON object, no markdown, no code fences, no preamble.`,
        `- Do NOT invent place names, item names, or character names. You may reference the NPC's location and the player's level by number.`,
        `- Do NOT reveal game mechanics ("you need affinity 50"). Stay in character.`,
        `- Tone should match the role (a quartermaster sounds practical; a scholar sounds curious; an apothecary speaks softly).`,
        `- If this is a first meeting, the lines should feel like an introduction.`
    ].join('\n');
}

function parseNpcFlavor(text: string, npc: NpcDef): NpcGeneratedFlavor {
    const fallback: NpcGeneratedFlavor = {
        description: `${npc.name} regards you in silence.`,
        dialogueLines: npc.prompts?.greeting ? [npc.prompts.greeting] : [`"...we have not yet had the time."`]
    };

    // Strip ```json fences if the model wrapped them.
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

    let parsed: any;
    try {
        // Try whole-string first; fall back to extracting the first {…}.
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (!match) {
                console.warn('[npcDialogue] no JSON found in AI response; using fallback');
                return fallback;
            }
            parsed = JSON.parse(match[0]);
        }
    } catch (e) {
        console.warn('[npcDialogue] JSON parse failed:', e);
        return fallback;
    }

    const description = typeof parsed?.description === 'string' && parsed.description.trim()
        ? parsed.description.trim().slice(0, 240)
        : fallback.description;

    const rawLines = Array.isArray(parsed?.dialogueLines) ? parsed.dialogueLines : [];
    const dialogueLines = rawLines
        .filter((l: unknown) => typeof l === 'string' && l.trim().length > 0)
        .map((l: string) => l.trim().slice(0, 180))
        .slice(0, 6);

    if (dialogueLines.length === 0) {
        return { description, dialogueLines: fallback.dialogueLines };
    }

    return { description, dialogueLines };
}
