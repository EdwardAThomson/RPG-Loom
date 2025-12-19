# Spec Doc (Sketch): **RPG Loom**

This spec assumes:

* **Deterministic game engine** (rules + outcomes are code-driven)
* **Agentic AI** is a *narrative layer* (quests, dialogue, journal) inspired by StoryDaemon’s “story ticks”, tool-based architecture, flexible LLM backends, and checkpointing ideas. ([GitHub][1])
* A **Remote-Runner-style** backend that supports multiple CLI/API LLM backends, task management, and SSE streaming in a monorepo layout (gateway/sdk/web). ([GitHub][2])

---

## 1) Goals

### Product goals

* Fun idle RPG loop: locations → activities → encounters → loot/XP → upgrades → unlocks.
* **Clear, deterministic progression** (same inputs/seed → same outputs).
* AI makes the world feel alive:

  * Quest titles + flavor
  * NPC dialogue
  * Rumors
  * Journal/chronicle entries
* Works as a local-first web app; can optionally run “remote narrative” as a service.

### Engineering goals

*   Monorepo with shared types + SDK + reusable engine module.
*   Streaming narrative output to UI (typing/log feel). ([GitHub][2])
*   Strict separation: **AI never decides outcomes** (no loot/damage/success rates).

### Non-goals (for MVP)

*   **Real-time** Multiplayer (MMO. Probably not Twitch-based?)
*   Real-time combat rendering
*   Fully dynamic AI-generated items/locations (AI can *describe* only what exists in data)

> **Note:** Async Multiplayer and Instanced Co-op are **future goals**. The architecture must support them (via determinism + seeded RNG), but they are not in the MVP scope.

---

## 2) Monorepo layout

Use a structure similar to LLM-Remote-Runner’s monorepo pattern (`gateway/`, `sdk/`, `web/`, `infra/`, `docs/`). ([GitHub][2])

Suggested repo tree:

*   `web/` (Next.js + Tailwind UI)
*   `gateway/` (NestJS API: tasks + auth + SSE streaming + CLI/API backends)
*   `sdk/` (typed client for gateway; shared task/event models)
*   `packages/engine/` (deterministic simulation engine; pure TS module)
*   `packages/content/` (JSON content: items, enemies, locations, quest templates)
*   `packages/shared/` (zod schemas, types, utilities, seeded RNG)
*   `infra/` (docker compose, optional sandbox runner)
*   `docs/` (architecture, content authoring, security notes)

(You can keep the names identical to your Remote Runner repo for familiarity.) ([GitHub][2])

---

## 3) Architecture overview

### Runtime modes

**Mode A: Local (recommended early)**

*   `web` runs in browser.
*   `engine` runs in browser and stores state locally.
*   `gateway` runs on localhost to execute CLI tools (Codex/Claude/Gemini) and stream responses.

**Mode B: Hosted**

*   `gateway` runs on a server (with strong sandboxing).
*   `web` connects remotely.
*   CLI backends may be disabled; API backends preferred.

> Note: Remote execution of CLIs has inherent security risk; your LLM Remote Runner repo explicitly warns it’s not security-audited. Treat “Hosted + CLI backends” as advanced/hardened work. ([GitHub][2])

### Core principle: Engine emits events; narrative consumes events

*   **Engine outputs:** structured `GameEvent`s (facts)
*   **Narrative outputs:** structured `NarrativeBlock`s (text + metadata)

### Multiplayer Readiness (Architecture Constraints)

Even in single-player, the system must adhere to these strict contracts to enable future async/co-op modes:

1.  **Command Contract (Append-only input)**:
    *   The **only** input to the engine is a `Command` object.
    *   Properties: `commandId`, `playerId`, `issuedAtMs`, `type`, `payload`.
    *   Must be **idempotent** and deterministic.

2.  **Event Contract (Fact-based output)**:
    *   The **only** output from the engine is a stream of `GameEvent` objects.
    *   Properties: `eventId`, `atMs`, `type`, `payload`, `correlationId`.
    *   Events describe **facts** (e.g., "Player took 5 damage"), never prose.

3.  **Authoritative Simulation**:
    *   The UI is just a dumb terminal that visualizes the state.
    *   Validity checks happen in the Engine, never trust the Client.

---

## 4) Deterministic Game Engine

### Tick model

*   Engine progresses in **ticks** (online: small tick interval; offline: batch ticks).
*   Each tick:

    1.  Consume activity plan (quest/hunt/gather/craft/train)
    2.  Resolve encounter roll (seeded)
    3.  Resolve combat (if applicable)
    4.  Apply rewards + state changes
    5.  Emit `GameEvent`s

### Seeded RNG & Time Inputs

*   **Stable Seeds**: `seed = hash(playerId, saveSlotId, tickIndex, encounterIndex, ...)`
*   **No implicit time**: `now` is passed as an argument to `step()`, never read from `Date.now()` inside the engine.
*   All randomness (loot, crit, checks) **must** derive from the seeded RNG.

### Engine API (package)

* `simulateOffline(state, from, to): { state, events, summary }`

### Content-driven

Load from `packages/content`:

* `locations.json`, `enemies.json`, `items.json`, `recipes.json`, `quest_templates.json`, `npcs.json`

---

## 5) Narrative Layer (Agentic AI)

Inspired by StoryDaemon’s “story ticks”, tool-based system, and multiple LLM backend support. ([GitHub][1])

### Narrative Tick triggers

Narrative tasks are created when events occur, e.g.:

* Quest accepted/completed
* Boss defeated
* New location discovered
* Crafting milestone
* Level-up
* “Daily reset” / session end

### Narrative Tick pipeline (bounded authority)

1. **Summarize:** convert recent `GameEvent`s + relevant state into a compact “facts packet”
2. **Plan:** choose one of a small set of narrative task types (below)
3. **Generate:** call LLM backend (CLI/API)
4. **Validate:** enforce schema + length limits + “no invented IDs”
5. **Commit:** store narrative block + update narrative memory

This mirrors the idea of iterative “ticks” and structured tools/checkpoints that StoryDaemon highlights. ([GitHub][1])

### Narrative task types (MVP)

* `quest_flavor` → title + intro + completion line
* `npc_dialogue` → 1–3 lines in persona voice
* `rumor_feed` → 3 short rumors (some may be red herrings but must reference real locations/factions)
* `journal_entry` → 1 paragraph “chronicle” of what happened

### Output schemas (JSON-only)

Example `NarrativeBlock`:

```json
{
  "type": "quest_flavor",
  "id": "nb_01HX...",
  "createdAt": "2025-12-13T21:00:00Z",
  "references": {
    "questId": "qt_bandits_01",
    "locationId": "loc_old_road_ruins",
    "npcId": "npc_scout_captain_rhea"
  },
  "title": "The Broken Mile",
  "lines": [
    "Rhea taps the map—too many torchlights on the Old Road again.",
    "“Keep your head down. Bring back proof. The outpost needs certainty.”"
  ],
  "tags": ["short", "grim", "frontier"]
}
```

Validation rules:

* Reject if it references unknown `itemId/enemyId/locationId/npcId`
* Enforce strict length budgets (good UX, low token cost)
* No numbers about loot/damage/odds unless engine provided them in facts packet

### Narrative memory store

A small local store per save slot:

* `narrative/journal/*.jsonl`
* `narrative/npcs/{npcId}.json` (relationship notes, last interactions)
* `narrative/threads.json` (open hooks)
* Optional later: embeddings index for recall

---

## 6) Gateway service (LLM runner + narrative orchestrator)

Model after LLM Remote Runner:

* multi-backend support (CLI + API)
* task management
* SSE streaming
* shared SDK ([GitHub][2])

### Responsibilities

* Run narrative tasks (not the game engine)
* Manage LLM backend configuration
* Stream output back to client (SSE)
* Optional auth (password/JWT) if you ever host it

### Key endpoints (sketch)

* `POST /api/tasks` → create narrative task
* `GET /api/tasks/:id` → status
* `POST /api/tasks/:id/cancel` → cancel
* `GET /api/tasks/:id/stream` → SSE stream tokens/lines
* `GET /api/backends` → list configured backends/models
* `POST /api/backends/test` → run a minimal “ping” prompt

### Task state model

* `queued | running | succeeded | failed | canceled`
* store: `startedAt, finishedAt, backend, model, promptHash, output, error`

---

## 7) Web app (UI)

### Core screens (MVP)

* **Home/Activity**: current location, activity card, progress, encounter log
* **Character**: stats, equipment, tactics
* **Inventory**: items + crafting materials
* **Quests**: active/completed + narrative flavor blocks
* **Journal**: chronological narrative blocks (AI + deterministic milestones)

### UI streaming

* When a narrative task is created, UI subscribes to `/stream` and renders output as it arrives (log “typing” feel). ([GitHub][2])

### Local persistence

* Save `EngineState` in IndexedDB (or localStorage initially)
* Save `NarrativeBlocks` locally as well (even if gateway is down, the story remains)

---

## 8) Security & safety notes (important)

Because the gateway can run CLIs:

* Default posture: **run gateway locally** on the same machine as the player.
* If hosted:

  * disable raw “shell command” execution
  * whitelist exact backends/commands
  * sandbox (container, locked-down FS, no secrets, resource limits)

Also: your current remote runner repo explicitly warns it’s not security-audited—keep that warning mindset for this project too. ([GitHub][2])

---

## 9) Testing strategy

### Engine (high priority)

* Golden tests for determinism:

  * given `(seed, state, commands)` → exact expected state after N ticks
* Property tests:

  * XP never decreases (unless death penalty is explicit)
  * inventory counts never go negative
  * no unknown IDs emitted in events

### Narrative (medium priority)

* Schema validation tests (reject invented references)
* Snapshot tests for prompt templates
* “Length budget” tests

---

## 10) MVP milestones

1. **Engine MVP**

* 2 locations, 5 enemies, 10 items, 5 quest templates
* tick loop + offline batching + event emission

2. **Web MVP**

* activity screen + inventory + quests
* event log + save/load

3. **Gateway MVP**

* create task + SSE stream + store result
* one backend (start with a single CLI or API)

4. **Narrative MVP**

* quest flavor + NPC dialogue + journal entry on quest completion
* strict schema validator (“no invented IDs”)

---


[1]: https://github.com/EdwardAThomson/StoryDaemon "GitHub - EdwardAThomson/StoryDaemon: StoryDaemon generates long-form fiction through an autonomous agent that plans, writes, and evolves stories organically."
[2]: https://github.com/EdwardAThomson/LLM-Remote-Runner "GitHub - EdwardAThomson/LLM-Remote-Runner: Execute CLI tasks remotely through a secure web interface with real-time streaming output"
 
 ---
 
 ## 11) Reference: Core Interfaces
 
 ### Type Primitives
 
 ```ts
 export type SaveId = string & { __brand: 'SaveId' };
 export type PlayerId = string & { __brand: 'PlayerId' };   // "local" in SP
 export type ClientId = string & { __brand: 'ClientId' };   // device/browser install id
 export type CommandId = string & { __brand: 'CommandId' };
 export type EventId = string & { __brand: 'EventId' };
 export type ContentVersion = string & { __brand: 'ContentVersion' };
 export type EngineVersion = 1;
 ```
 
 ### EngineState
 
 ```ts
 export interface EngineState {
   engineVersion: EngineVersion;
   contentVersion: ContentVersion;
   saveId: SaveId;
   playerId: PlayerId;       // "local" for offline SP
   clientId: ClientId;       // stable per installation
 
   createdAtMs: number;
   updatedAtMs: number;
 
   // Time authority fields:
   lastTickAtMs: number;     // authoritative in online mode
   tickIndex: number;
 
   currentLocationId: LocationId;
 
   player: PlayerState;
   inventory: InventoryStack[];
   equipment: EquipmentState;
   quests: QuestInstanceState[];
   activity: ActivityPlan;
 }
 ```
 
 ### CommandEnvelope
 
 ```ts
 export interface CommandEnvelope<T extends PlayerCommand = PlayerCommand> {
   commandId: CommandId;
   playerId: PlayerId;
   clientId: ClientId;
   issuedAtMs: number;
 
   engineVersion: EngineVersion;
   contentVersion: ContentVersion;
 
   command: T;
 }
 ```
 
 ### BaseEvent
 
 ```ts
 export interface BaseEvent<TType extends string, TPayload> {
   eventId: EventId;
   atMs: number;
   type: TType;
   payload: TPayload;
   playerId: PlayerId;
   correlation?: {
     commandId?: CommandId;
   };
 
   engineVersion: EngineVersion;
   contentVersion: ContentVersion;
 }
 ```
 
 ### NarrativeFactsBundle
 
 ```ts
 export interface NarrativeFactsBundle {
   bundleId: string;
   saveId: SaveId;
   playerId: PlayerId;
 
   createdAtMs: number;
   engineVersion: EngineVersion;
   contentVersion: ContentVersion;
 
   recentEvents: GameEvent[];
   stateSummary?: {
     level: number;
     locationId: LocationId;
     activeQuestIds: QuestInstanceId[];
   };
 }
 ```

