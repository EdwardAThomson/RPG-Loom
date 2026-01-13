# AI Integration Ideas for RPG-Loom

## Overview

This document explores two major AI integration strategies for RPG-Loom, leveraging the Universal LLM Backend system from `newtemp/`.

---

## 🎯 Idea 1: AI-Generated Quest Content

**Status:** Recommended for Phase 1 implementation

### Concept

Enable AI to enhance quest templates with narrative flavor while keeping game mechanics deterministic and engine-driven.

### Current Quest System

```typescript
// Template defines mechanics (deterministic)
{
  id: 'quest_wolves',
  objectiveType: 'kill',
  targetEnemyId: 'enemy_wolf',
  qtyMin: 5, qtyMax: 10,
  locationPool: ['loc_forest']
}
```

### Enhanced with AI

```typescript
// AI adds narrative wrapper (non-deterministic, optional)
{
  id: 'quest_wolves_001',
  template: 'quest_wolves',
  aiGenerated: {
    title: "The Shepherd's Plea",
    description: "A desperate shepherd begs for help. Wolves from the Darkwood have been stalking his flock under the pale moon...",
    npcDialogue: {
      accept: "Thank the gods you've come! Please, drive them back before the next nightfall.",
      progress: "I can still hear their howls in the distance...",
      complete: "You've saved my livelihood! The village will sleep soundly tonight."
    },
    rewards: { 
      narrative: "The grateful shepherd presses a worn family heirloom into your hands." 
    }
  }
}
```

### Implementation Approaches

#### Option A: Template Enhancement (Recommended)

- **Mechanics:** Deterministic, engine-driven
- **Narrative:** AI-generated wrapper
- **Gateway Endpoint:** `POST /api/narrative/enhance-quest`
- **Tool Call:** `enhance_quest_narrative(templateId, context)`

**Pros:**
- Preserves deterministic engine
- Easy to test and validate
- Graceful degradation (works without AI)
- Clear separation of concerns

**Cons:**
- Limited to existing templates
- Less creative freedom

#### Option B: Full AI Quest Generation

- **Mechanics:** AI-proposed, engine-validated
- **Narrative:** AI-generated
- **Validation:** Against available content (enemies, items, locations)

**Pros:**
- Maximum flexibility
- Unique, varied quests
- Emergent gameplay

**Cons:**
- Complex validation required
- Harder to balance
- Potential for invalid quests

### Tool Call Design

```typescript
// AI Tool Definition
{
  name: "create_quest",
  description: "Create a new quest with AI-generated narrative based on an existing template",
  parameters: {
    type: "object",
    properties: {
      templateId: {
        type: "string",
        description: "Base quest template ID (e.g., 'quest_wolves')"
      },
      title: {
        type: "string",
        description: "Quest title (concise, engaging)"
      },
      description: {
        type: "string",
        description: "Quest description (2-3 sentences)"
      },
      locationId: {
        type: "string",
        description: "Location where quest takes place"
      },
      npcContext: {
        type: "object",
        properties: {
          name: { type: "string" },
          mood: { type: "string" },
          personality: { type: "string" }
        }
      }
    },
    required: ["templateId", "title", "description"]
  }
}
```

### Gateway Endpoint Example

```typescript
// gateway/src/server.ts
app.post('/api/narrative/enhance-quest', async (req, res) => {
  const { templateId, context } = req.body;
  
  // Load template
  const template = content.questTemplatesById[templateId];
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  
  // Build prompt
  const prompt = `Generate narrative content for a quest:
  
Template: ${template.id}
Type: ${template.objectiveType}
Target: ${template.targetEnemyId || template.targetItemId}
Location: ${context.locationId}
Quantity: ${template.qtyMin}-${template.qtyMax}

Generate:
1. A compelling quest title (max 5 words)
2. A brief description (2-3 sentences)
3. NPC dialogue for accept/progress/complete

Keep tone medieval fantasy, concise and engaging.`;

  const result = await llmService.generateUnified({
    provider: 'gemini-cli',
    model: 'gemini-3-flash-preview',
    prompt,
    maxTokens: 300,
    temperature: 0.8
  });
  
  // Parse and structure response
  const narrative = parseQuestNarrative(result);
  
  res.json({ narrative });
});
```

---

## 🤖 Idea 2: AI Agent Playing the Game

**Status:** Recommended for Phase 2+ (Developer Tool)

### Concept

Provide a complete API for an AI agent to autonomously play RPG-Loom, enabling automated testing, balance validation, and demo generation.

### Use Cases

1. **Automated Testing:** AI discovers edge cases and bugs
2. **Balance Validation:** Identifies overpowered/underpowered content
3. **Demo Generation:** Creates engaging playthrough content
4. **Regression Testing:** Validates game mechanics after changes
5. **Content Validation:** Ensures all quests are completable

### API Design

```typescript
// Game State API
GET  /api/game/:playerId/state        // Current state snapshot
POST /api/game/:playerId/command      // Execute command
GET  /api/game/:playerId/events       // Recent events (last N)
GET  /api/game/:playerId/options      // Available actions
POST /api/game/:playerId/reset        // Reset to new game
```

### Tool Calls for AI Agent

```typescript
const agentTools = [
  {
    name: "get_game_state",
    description: "Get current player state including location, inventory, skills, active quests, and stats",
    parameters: {
      type: "object",
      properties: {
        playerId: { type: "string" }
      }
    }
  },
  {
    name: "get_available_actions",
    description: "List all valid actions the player can take right now",
    parameters: {
      type: "object",
      properties: {
        playerId: { type: "string" }
      }
    }
  },
  {
    name: "perform_action",
    description: "Execute a game command (activity, travel, craft, quest, etc.)",
    parameters: {
      type: "object",
      properties: {
        playerId: { type: "string" },
        action: {
          type: "string",
          enum: ["start_activity", "travel", "craft", "accept_quest", "equip_item", "set_tactics"]
        },
        params: {
          type: "object",
          description: "Action-specific parameters"
        }
      }
    }
  },
  {
    name: "read_events",
    description: "Get recent game events (combat, loot, XP, level-ups)",
    parameters: {
      type: "object",
      properties: {
        playerId: { type: "string" },
        count: { type: "number", default: 10 }
      }
    }
  }
];
```

### AI Agent Behavior Examples

#### Goal-Oriented Agent

```
AI Goal: "Reach level 10 in Mining"

Strategy:
1. get_game_state() → Check current Mining level
2. get_available_actions() → See mining available at Forest
3. perform_action({ action: "mine", locationId: "loc_forest" })
4. read_events() → Monitor XP gains
5. Adapt: If HP low, switch to recovery
6. Optimize: Travel to better mining locations when unlocked
7. Repeat until goal achieved
```

#### Story-Driven Agent

```
AI Goal: "Complete all quests in the Forest region"

Strategy:
1. get_game_state() → Check active quests
2. get_available_actions() → List available quests
3. perform_action({ action: "accept_quest", questId: "quest_wolves_001" })
4. Read quest objective, plan approach
5. Execute quest activities (hunt/gather)
6. Narrate journey in chat
7. Complete quest, move to next
```

#### Optimization Agent

```
AI Goal: "Find optimal XP/hour strategy"

Strategy:
1. Test different activities (mining, combat, crafting)
2. Track XP gains over time
3. Calculate XP/hour rates
4. Identify bottlenecks (gold, materials, HP)
5. Report findings
6. Suggest balance changes
```

### Gateway Endpoint Examples

```typescript
// Get current game state
app.get('/api/game/:playerId/state', (req, res) => {
  const { playerId } = req.params;
  const state = gameStates.get(playerId);
  
  if (!state) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  res.json({
    player: state.player,
    location: state.currentLocationId,
    inventory: state.inventory,
    equipment: state.equipment,
    quests: state.quests,
    activity: state.activity
  });
});

// Get available actions
app.get('/api/game/:playerId/options', (req, res) => {
  const { playerId } = req.params;
  const state = gameStates.get(playerId);
  
  if (!state) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const location = content.locationsById[state.currentLocationId];
  const options = {
    activities: location.activities || [],
    canTravel: Object.keys(content.locationsById).filter(id => {
      const loc = content.locationsById[id];
      return meetsRequirements(state.player, loc.requirements);
    }),
    canCraft: Object.keys(content.recipesById).filter(id => {
      const recipe = content.recipesById[id];
      return canCraft(state, recipe);
    }),
    availableQuests: getAvailableQuests(state, location)
  };
  
  res.json(options);
});

// Execute command
app.post('/api/game/:playerId/command', (req, res) => {
  const { playerId } = req.params;
  const { command } = req.body;
  
  const state = gameStates.get(playerId);
  if (!state) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  // Apply command to engine
  const result = applyCommand(state, command, content);
  
  // Update state
  gameStates.set(playerId, result.state);
  
  res.json({
    success: true,
    events: result.events,
    newState: result.state
  });
});
```

---

## 🎨 Combined Vision: AI-Enhanced Gameplay Loop

Combining both ideas creates a powerful, self-demonstrating system:

```
1. AI Agent starts playing RPG-Loom
2. Discovers quest template needs narrative
3. Calls enhance_quest_narrative() to generate story
4. Accepts the now-flavored quest
5. Narrates its adventure as it plays
6. Completes quest
7. AI generates completion epilogue
8. Shares "playthrough journal" as demo content
```

### Benefits

- **Self-Playing Demo:** Showcases both deterministic engine AND AI narrative
- **Automated Testing:** Validates game balance continuously
- **Content Generation:** Creates engaging, shareable content
- **Development Tool:** Helps identify bugs and balance issues
- **Marketing Asset:** AI playthrough videos/logs

---

## 📋 Recommended Implementation Order

### Phase 1: AI Quest Enhancement ✅ Start Here

**Goal:** Add narrative flavor to existing quests

1. Add `POST /api/narrative/enhance-quest` endpoint to gateway
2. Create tool definition for AI to call
3. Store AI-generated content in quest instances
4. Display enhanced narrative in QuestView UI
5. Add toggle to enable/disable AI enhancement

**Estimated Effort:** 1-2 days  
**Risk:** Low  
**Value:** High (immediate player impact)

### Phase 2: Read-Only Agent API

**Goal:** Allow AI to observe gameplay

1. Add `GET /api/game/:playerId/state` endpoint
2. Add `GET /api/game/:playerId/options` helper
3. Create AI agent script that observes gameplay
4. Test with manual commands
5. Generate observation reports

**Estimated Effort:** 2-3 days  
**Risk:** Low (read-only)  
**Value:** Medium (testing foundation)

### Phase 3: Full Agent Control

**Goal:** Enable autonomous AI gameplay

1. Add `POST /api/game/:playerId/command` endpoint
2. Implement tool calls for all player commands
3. Add safety limits (rate limiting, validation)
4. Create autonomous agent that plays the game
5. Add agent behavior presets (goal-oriented, story-driven, optimizer)

**Estimated Effort:** 3-5 days  
**Risk:** Medium (validation complexity)  
**Value:** High (testing + demo)

### Phase 4: Integration & Polish

**Goal:** Combine both systems seamlessly

1. Agent uses quest enhancement tools while playing
2. Generates narrative journal of its adventure
3. Creates shareable "AI playthrough" content
4. Add web UI to watch agent play in real-time
5. Export playthrough as markdown/video

**Estimated Effort:** 2-3 days  
**Risk:** Low  
**Value:** Very High (unique feature)

---

## 🚀 Quick Win: Proof of Concept

### Minimal PoC for Quest Enhancement

**Step 1:** Add one endpoint to gateway

```typescript
// gateway/src/server.ts
app.post('/api/narrative/quest-flavor', async (req, res) => {
  const { templateId, context } = req.body;
  
  const prompt = `Generate a quest title and description for:
  Type: ${context.type}
  Target: ${context.target}
  Location: ${context.location}
  
  Keep it concise (2-3 sentences). Format as JSON:
  {
    "title": "...",
    "description": "..."
  }`;
  
  const result = await llmService.generateUnified({
    provider: 'gemini-cli',
    model: 'gemini-3-flash-preview',
    prompt,
    maxTokens: 200,
    temperature: 0.8
  });
  
  // Parse JSON response
  const narrative = JSON.parse(result);
  
  res.json({ narrative });
});
```

**Step 2:** Test it

```bash
curl -X POST http://localhost:3000/api/narrative/quest-flavor \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "quest_wolves",
    "context": {
      "type": "kill",
      "target": "wolves",
      "location": "forest"
    }
  }'
```

**Step 3:** If successful, expand!

---

## 💭 Recommendations

### Start with Idea 1 (AI Quest Enhancement)

**Why:**
- ✅ Lower complexity
- ✅ Immediate player value
- ✅ Preserves deterministic engine
- ✅ Easy to test and iterate
- ✅ Builds foundation for Idea 2
- ✅ Aligns with RPG-Loom's "AI is optional" philosophy

### Add Idea 2 (AI Agent) as Developer Tool

**Why:**
- 🧪 Automated testing
- 📊 Balance validation
- 🎬 Demo generation
- 🐛 Bug discovery
- 📈 Analytics (XP rates, progression curves)
- 🎮 Regression testing

### The Combination is Powerful

When both systems work together:
- AI generates quest narratives
- AI agent tests those quests
- AI validates quest completability
- AI creates demo content
- AI discovers balance issues
- **Result:** Self-improving game system

---

## 🔧 Technical Considerations

### Determinism vs AI

**Core Principle:** Game mechanics must remain deterministic

- ✅ AI enhances narrative (non-deterministic, optional)
- ✅ AI validates content (deterministic outcomes)
- ❌ AI does NOT affect game state or outcomes
- ❌ AI does NOT replace engine logic

### Validation Requirements

**For AI-Generated Content:**
- Schema validation (Zod)
- Content ID validation (must reference existing items/enemies/locations)
- Length limits (prevent spam)
- Profanity filtering (optional)
- Fallback to template defaults if AI fails

**For AI Agent Commands:**
- Command validation against engine rules
- Rate limiting (prevent spam)
- Sandboxing (separate player IDs for agents)
- Audit logging (track all agent actions)

### Performance Considerations

- Cache AI-generated quest narratives
- Batch agent commands (don't spam engine)
- Use streaming for long-running agent sessions
- Implement timeouts for AI calls
- Graceful degradation if AI unavailable

---

## 📚 Next Steps

1. **Review this document** with team/stakeholders
2. **Choose starting point** (recommend Phase 1)
3. **Set up LLM backend** from `newtemp/`
4. **Implement PoC** for quest enhancement
5. **Test and iterate**
6. **Expand to agent API** when ready

---

## 📖 References

- [Universal LLM Backend Guide](file:///home/edward/Projects/RPG-Loom/newtemp/llm_backend_copy_guide.md)
- [Quest Ideas Document](file:///home/edward/Projects/RPG-Loom/quests_idea.md)
- [RPG-Loom Architecture](file:///home/edward/Projects/RPG-Loom/docs/ARCHITECTURE.md)
- [Engine Source](file:///home/edward/Projects/RPG-Loom/packages/engine/src/engine.ts)
