# AI-Powered Quest Generation in RPG-Loom: The Best of Both Worlds?

*How we built a hybrid system that combines creative AI storytelling with deterministic gameplay*

---

## What is RPG-Loom?

RPG-Loom is a dark fantasy idle RPG that explores a unique architectural approach: **a fully deterministic game engine enhanced by optional AI-generated quests** (not yet full narrative!). Think of it as a traditional RPG where every mechanic is predictable and fair, but with an AI companion that weaves your actions into compelling stories.

The core philosophy is simple:

- **The game works perfectly without AI** - Mine ore, craft weapons, complete quests, level up
- **AI enhances the experience** - Turns mundane actions into narrative arcs, generates unique adventures
- **Never gameplay-blocking** - If AI fails or is disabled, you keep playing

This separation of concerns creates something special: the reliability of deterministic systems with the creativity of generative AI.

RPG Loom is an experiment for testing AI features in games. It's playable and essentially complete, but not a feature-rich product. It's a proof of concept for the future of gaming.


## The Adventure Quest Challenge

Traditional RPGs face a content creation bottleneck. Each quest requires:

- Writing engaging narrative
- Designing balanced mechanics
- Testing for edge cases
- Ensuring progression coherence

This is why most games have a fixed number of quests. Once you've completed them all, the experience becomes repetitive.

--- 

**What if quests could be generated infinitely while maintaining quality and balance?**

This is where our hybrid adventure quest system comes in.

## The Hybrid Approach: Templates + AI Narrative

Instead of letting AI create arbitrary quests (which could break game balance), we designed a **template-based system** where AI selects from predefined mechanical building blocks.

### The Templates

Every quest step in RPG-Loom uses one of six validated templates:

```typescript
type AdventureStepTemplate =
  | { type: 'kill'; targetEnemyId: EnemyId; qty: number }
  | { type: 'gather'; targetItemId: ItemId; qty: number }
  | { type: 'travel'; targetLocationId: LocationId }
  | { type: 'explore'; targetLocationId: LocationId; durationMs: number }
  | { type: 'craft'; targetRecipeId: RecipeId; qty: number }
  | { type: 'deliver'; targetItemId: ItemId; targetLocationId: LocationId; qty: number };
```

These templates are:

- ✅ **Mechanically sound** - Validated by the engine
- ✅ **Balanced** - Rewards scale with difficulty
- ✅ **Deterministic** - Same inputs = same outputs
- ✅ **Composable** - Mix and match for variety

### The AI's Role

The AI (Gemini, Claude, or others) doesn't invent mechanics. Instead, it:

1. **Selects appropriate templates** for a coherent quest arc
2. **Chooses valid content IDs** from available enemies, items, locations
3. **Writes compelling narrative** that ties steps together
4. **Scales difficulty** based on player level

Here's an example AI-generated quest:

```json
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
```

Notice how the AI created a thematic arc (investigation → gathering → confrontation) while only using validated game elements.

---

## How It Works: The Technical Flow

### 1. Context-Aware Prompting

When the player requests an adventure, we build a detailed prompt that includes:

```typescript
// Available game content
const availableLocations = ["Forest (loc_forest)", "Catacombs (loc_catacombs)", ...]
const availableEnemies = ["Skeleton (enemy_skeleton)", "Ghost (enemy_ghost)", ...]
const availableItems = ["Ghostly Essence (item_ghostly_essence)", ...]
const availableRecipes = ["Gold Ingot (recipe_gold_ingot)", ...]

// Player context
const currentLocation = "Haven (loc_haven)"
const playerLevel = 12
```

The prompt explicitly lists:

- ✅ What templates are available
- ✅ What IDs can be referenced
- ✅ Required JSON structure
- ✅ Narrative constraints (dark fantasy, 3-5 steps)

### 2. LLM Generation

The system supports multiple backends:

- **Cloud APIs**: Gemini, OpenAI, Claude (with API keys)
- **CLI Tools**: gemini-cli, claude-cli, codex-cli
- **Fallback**: Mock provider for testing

The gateway routes requests appropriately and streams responses back to the UI.

### 3. Validation and Parsing

Critically, we **validate every AI response**:

```typescript
function parseAdventureSpec(text: string, playerLevel: number): AdventureQuestSpec {
  // Remove markdown code blocks
  let cleaned = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '');
  
  const parsed = JSON.parse(cleaned);
  
  // Validate step templates
  const steps = (parsed.steps || []).map((s, idx) => ({
    stepNumber: s.stepNumber || idx + 1,
    template: s.template || fallbackTemplate,
    narrative: {
      description: s.narrative?.description || 'Continue the adventure',
      context: s.narrative?.context
    }
  }));
  
  // Scale rewards by player level
  const levelMultiplier = Math.max(1, playerLevel / 10);
  
  return {
    title: parsed.title || 'Mysterious Adventure',
    description: parsed.description || 'An adventure awaits...',
    steps,
    difficulty: parsed.difficulty || 3,
    rewards: {
      xp: Math.floor((parsed.rewards?.xp || 300) * levelMultiplier),
      gold: Math.floor((parsed.rewards?.gold || 150) * levelMultiplier),
      items: parsed.rewards?.items || []
    }
  };
}
```

If parsing fails (invalid JSON, malformed structure), the system provides a safe fallback quest instead of breaking.

### 4. Engine Integration

Once validated, the engine:

1. Creates a main adventure quest instance
2. Stores the `adventureSteps` with templates and narrative
3. Unlocks steps sequentially as the player progresses
4. Spawns dynamic sub-quests for each active step
5. Tracks progress through the existing quest system

For example, a crafting step creates a sub-quest with ID:
```
dynamic_craft_recipe_gold_ingot
```

The engine recognizes this pattern and tracks progress when you craft the target item.

---

## Why This Architecture Matters

### Safety First

By constraining AI to template selection, we get:

- **No invented mechanics** - AI can't create a "fly to the moon" quest
- **Guaranteed balance** - All rewards calculated by deterministic formulas
- **Content validation** - Every ID must exist in the game database
- **Graceful degradation** - Invalid output → fallback quest

### Creative Freedom

Within those constraints, AI has remarkable creative latitude:

- **Increased variety** - Every quest feels unique
- **Thematic coherence** - Steps form narrative arcs
- **Dynamic difficulty** - Scaled to player level and context
- **Rich storytelling** - Context and flavor text enhance immersion

### Maintainability

The separation of concerns makes the system easy to extend:

- **Add new templates** - Define once, AI uses automatically
- **Switch LLM providers** - Backend-agnostic architecture
- **Test deterministically** - Template logic is pure code
- **Debug narratives** - AI output doesn't affect game state


## Implementation Highlights

### Quest Activity Independence

Recently, we solved a tricky problem: when a quest required crafting an item, starting the crafting activity would "lose context" of the active quest.

The fix involved refactoring the engine to support **focused quest activities**:

```typescript
// Before: Switching activities lost quest context
activity.type = 'craft' // Quest is paused!

// After: Quest internally performs sub-tasks
if (quest.templateId.startsWith('dynamic_craft_')) {
  const targetRecipeId = quest.templateId.replace('dynamic_craft_', '');
  performCraftTick(next, a, content, events, tickAtMs); // Quest stays active!
}
```

Now the UI shows a **✨ QUEST FOCUS** indicator when your current action contributes to an active quest, making progression feel seamless.

### Multi-Provider Support

The gateway abstracts LLM providers through a unified interface:

```typescript
export async function generateUnified(params: GenerateParams): Promise<string> {
  const { provider, model, prompt } = params;
  
  if (isCLIProvider(provider)) {
    return await generateWithCLI({ provider, model, prompt, cwd });
  }
  
  if (isCloudProvider(provider)) {
    return await generateWithCloud({ provider, model, prompt, apiKey });
  }
  
  throw new Error(`Unsupported provider: ${provider}`);
}
```

Players can choose their preferred LLM based on:

- **Cost** - CLI tools use local API keys efficiently
- **Speed** - Cloud APIs are often faster
- **Privacy** - CLI tools run entirely locally
- **Quality** - Different models excel at different tasks

---

## What's Next?

The template-based approach opens exciting possibilities:

### Advanced Templates
```typescript
// Branching narratives
{ type: 'choice'; options: [...], consequences: [...] }

// Time-limited events
{ type: 'timed_challenge'; durationMs: number, template: ... }

// Conditional steps
{ type: 'conditional'; requirement: ..., thenTemplate: ..., elseTemplate: ... }
```

### Tool Calling Enhancement

While the current system uses prompt-based generation, we could enhance it with function calling:

```typescript
// LLM queries available content dynamically
const tools = [
  {
    name: 'query_enemies',
    description: 'Get enemies available at a location',
    parameters: { locationId: string, minLevel: number }
  },
  {
    name: 'validate_recipe_chain',
    description: 'Check if an item chain is craftable',
    parameters: { targetItemId: string }
  }
];
```

This would make quest generation more context-aware and reduce prompt complexity.

### Persistent Campaign Arcs

Individual adventures could connect into longer campaigns:
```typescript
{
  campaignId: 'the_immortal_uprising',
  chapter: 3,
  previousQuestId: 'quest_12345',
  choicesFromPrevious: ['spared_the_necromancer']
}
```

---

## Takeaways for Developers

If you're building AI-enhanced games, consider this hybrid approach:

1. **Define mechanical boundaries** - What can AI control vs. what's hardcoded?
2. **Use templates or schemas** - Constrain AI output to valid structures
3. **Validate everything** - Never trust LLM output directly
4. **Separate narrative from mechanics** - AI should enhance, not replace, your engine
5. **Graceful degradation** - The game must work when AI fails

The result is a system that's:

- ✅ **Reliable** - Deterministic core ensures fairness
- ✅ **Creative** - AI generates infinite variety
- ✅ **Maintainable** - Clear separation of concerns
- ✅ **Scalable** - Easy to add templates and providers

---

## Try It Yourself

RPG-Loom is open source! Check out the code:

- **Repository**: [github.com/EdwardAThomson/RPG-Loom](https://github.com/EdwardAThomson/RPG-Loom)
- **Quest Generation**: `web/src/services/adventureQuestGeneration.ts`
- **Engine Logic**: `packages/engine/src/engine.ts`
- **AI Interface**: `gateway/src/llm/generator.ts`

Set up the project locally and experiment with:

- Different LLM providers
- Custom quest templates
- Modified prompts for different narrative tones

We'd love to see what you build!


## Conclusion

By combining AI creativity with deterministic templates, RPG-Loom achieves something unique: **pseudo-infinite content that never breaks the game**. The AI becomes a creative partner within well-defined boundaries, enhancing the player experience without compromising reliability.

This architectural pattern has applications beyond gaming - any system that needs both creative generation and guaranteed safety could benefit from this hybrid approach.

Will this approach be more prevalent in the future of game development?

---

*Written by Edward Thomson | January 2026*
*Follow the project on [GitHub](https://github.com/EdwardAThomson/RPG-Loom)*
