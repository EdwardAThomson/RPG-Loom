 
# Architecture

Project: **RPG-Loom Chronicles**
Core idea: **Deterministic engine + optional narrative (AI) layer**
Repo style: **Monorepo**
# Architecture

Project: **RPG-Loom Chronicles**
Core idea: **Deterministic engine + optional narrative (AI) layer**
Repo style: **Monorepo**

---

## 1) High-level flow

The game is driven by **Commands → Engine → Events**.
AI (Gemini) consumes **Events** and produces **NarrativeBlocks** (text only).

```text
┌──────────────┐      Commands       ┌──────────────────────┐      Events       ┌──────────────┐
│   Web UI     │ ───────────────────► │  Engine (deterministic) │ ──────────────► │  Web UI Log  │
│ (React/Vite) │                     │   packages/engine    │                  │ (render facts)│
└──────┬───────┘                     └─────────┬────────────┘                  └──────┬───────┘
       │                                       │                                      │
       │ Narrative Tasks (optional)            │ FactsBundle (derived from events)    │
       ▼                                       ▼                                      ▼
┌──────────────┐     SSE stream     ┌──────────────────────┐      JSON output   ┌──────────────┐
│  Gateway API │ ◄───────────────── │  LLM Backend (Gemini) │ ─────────────────► │ Narrative UI  │
│ (tasks + SSE)│ ─────────────────► │  CLI/API runner       │                   │ (render text) │
└──────────────┘  create task       └──────────────────────┘                   └──────────────┘
````

Key rule: **AI never creates or changes gameplay events**, only narrative text.

---

## 2) Modules and responsibilities

### 2.1 `packages/engine` — deterministic simulation

Responsibilities:

* Owns all gameplay rules: ticks, encounters, combat resolution, loot, XP, crafting, quest progress.
* Produces `GameEvent[]` as the only “truth stream”.
* No IO, no network, no wall-clock reads; time is passed in.

Primary APIs:

* `applyCommand(state, CommandEnvelope) -> { state, events }`
* `step(state, nowMs) -> { state, events, ticksProcessed }`
* `simulateOffline(state, fromMs, toMs) -> { state, events, summary }`

### 2.2 `packages/content` — data packs

Responsibilities:

* JSON files defining locations, enemies, items, recipes, quest templates, NPC mechanical roles.
* Must be validated (schema + ID references) before runtime.

### 2.3 `packages/shared` — contracts + validation

Responsibilities:

* Shared TypeScript types and `zod` schemas for:

  * `EngineState`, `CommandEnvelope`, `GameEvent`
  * content schemas
  * `NarrativeFactsBundle`, `NarrativeTask`, `NarrativeBlock`

### 2.4 `web/` — player UI

Responsibilities:

* Displays state and events.
* Sends commands.
* Stores saves locally (later: cloud sync).
* Shows narrative blocks when available, but remains fully functional without them.

### 2.5 `gateway/` — optional task runner + streaming

Responsibilities:

* Accepts `NarrativeTask` requests.
* Runs a backend (Gemini CLI/API, or mock).
* Streams output via SSE.
* Validates output strictly (JSON-only, no invented IDs, length budgets).
* Returns a `NarrativeBlock` result (stored per save slot).

### 2.6 `sdk/` — typed gateway client

Responsibilities:

* Functions for:

  * `createNarrativeTask()`
  * `streamNarrativeTask()`
  * `getTaskStatus()`

---

## 3) Data contracts

### 3.1 Command → Engine (authoritative input)
 
 * **Strict Append-Only**: The UI never mutates state directly.
 * **Idempotency Required**: Every command must be retriable without side effects.
 * Schema: `CommandEnvelope`
   * `commandId` (UUID) for idempotency
   * `type` (START_QUEST, EQUIP_ITEM, etc)
   * `payload` (Typed JSON)
   * `playerId` (for future multi-tenant support)
   * `issuedAtMs` (trusted timestamp for order)
 
 ### 3.2 Engine → UI (authoritative output)
 
 * **Fact Stream only**: Engine emits `GameEvent[]` describing *what happened*.
 * **No Prose**: Events are facts ("Took 5 damage"), never flavor text.
 * **Authoritative Sim**: The UI renders the `EngineState` snapshot but trusts the Engine for all validity checks.

### 3.3 Events → FactsBundle (safe AI input)

* FactsBundle is derived from recent `GameEvent[]`.
* It contains **resolved facts only** (no probabilities, no “roll this now”).

### 3.4 NarrativeTask → NarrativeBlock (AI output)

* Must be JSON-only.
* Must reference only known IDs (from content + state).
* Must obey budgets (lines/chars).
* If invalid: gateway returns a safe fallback block.

---

## 4) Runtime modes

### Mode A: Fully offline (no gateway)

* Engine runs in browser.
* Saves stored locally.
* Narrative UI is hidden or shows “AI disabled”.

### Mode B: Offline + local gateway (recommended with Gemini CLI)

* Engine runs in browser.
* Gateway runs on localhost to execute Gemini CLI.
* Narrative is streamed back to UI via SSE.
* If gateway/AI fails: game continues normally.

### Mode C: Hosted async (future)

* Server becomes authoritative for shared systems (leaderboards, guild contributions, instances).
* Client sends commands; server simulates and returns snapshot + events.
* Narrative can still be server-side or client-side, but must consume FactsBundles only.

---

## 5) Error handling and fallback behavior

### Engine errors

* Engine never throws uncaught runtime errors to UI.
* Emit `ERROR` events with safe messages/codes.
* State remains valid (no partial mutation).

### Gateway/AI errors

* Task can end as `failed` with an error message.
* UI should show:

  * “AI unavailable” placeholder
  * deterministic event log remains visible
* Gateway uses:

  * timeouts
  * cancellation
  * output validation
  * backend fallback (mock)

---

## 6) Security boundaries (important)

* Engine is safe by design (pure computation).
* Gateway running CLI tools is the primary risk surface.

  * Default: run locally
  * If hosted later: disable raw shell, whitelist commands, sandbox, no secrets, resource limits

---

## 7) Future: async multiplayer + instanced co-op

### Async multiplayer (Phase 1)

* Server authoritative for:

  * leaderboards
  * guild/world event contributions
  * cloud saves
* Client can still run local engine for “preview”, but server is truth.

### Instanced co-op dungeons (Phase 2)

* Server hosts an `instanceId` with a seed.
* Players submit “plans” (loadout/tactics/thresholds) per window.
* Server simulates deterministically and distributes rewards.

---

## 8) Practical checklist for “architecture compliance”

* [ ] No `Math.random()` in engine
* [ ] No wall-clock reads in engine
* [ ] UI only changes state by sending commands
* [ ] Events are the only facts source for narrative
* [ ] Narrative outputs are JSON-only + validated + can be safely dropped
* [ ] Saves include `engineVersion` and `contentVersion`


# Addendum

If you want, I can also add a **very small sequence diagram** for one complete loop (“Accept quest → simulate ticks → quest complete → build facts bundle → Gemini generates quest outro → UI renders block”) to make it crystal clear for future contributors.

## Sequence diagram: Quest loop with optional narrative

Scenario: Player accepts a quest, runs activity ticks, completes it, and (optionally) gets an AI-written outro.

```text
Player            Web UI                Engine (deterministic)           Gateway (tasks+SSE)        Gemini Backend
  │                │                           │                             │                     │
  │ Click "Accept" │                           │                             │                     │
  ├───────────────►│                           │                             │                     │
  │                │ create CommandEnvelope    │                             │                     │
  │                ├──────────────────────────►│ applyCommand(ACCEPT_QUEST)  │                     │
  │                │                           ├───────────────┐             │                     │
  │                │                           │ emits events:  │             │                     │
  │                │                           │ QUEST_ACCEPTED │             │                     │
  │                │                           └───────┬────────┘             │                     │
  │                │◄──────────────────────────┤ {state, events}              │                     │
  │                │ render quest card/log     │                             │                     │
  │                │                           │                             │                     │
  │ Start activity │                           │                             │                     │
  ├───────────────►│                           │                             │                     │
  │                │ send SET_ACTIVITY command │                             │                     │
  │                ├──────────────────────────►│ applyCommand(SET_ACTIVITY)  │                     │
  │                │◄──────────────────────────┤ {state, events}              │                     │
  │                │                           │                             │                     │
  │ Wait / offline │                           │                             │                     │
  │ time passes    │                           │                             │                     │
  │                │ call step/simOffline      │                             │                     │
  │                ├──────────────────────────►│ step()/simulateOffline()     │                     │
  │                │                           ├───────────────┐             │                     │
  │                │                           │ emits events:  │             │                     │
  │                │                           │ ENCOUNTER_*    │             │                     │
  │                │                           │ LOOT_GAINED    │             │                     │
  │                │                           │ QUEST_PROGRESS │             │                     │
  │                │                           │ QUEST_COMPLETED│             │                     │
  │                │                           └───────┬────────┘             │                     │
  │                │◄──────────────────────────┤ {state, events}              │                     │
  │                │ render rewards + logs     │                             │                     │
  │                │                           │                             │                     │
  │                │ IF AI enabled: build FactsBundle from recent events      │                     │
  │                │ create NarrativeTask(quest_flavor or journal_entry)      │                     │
  │                ├────────────────────────────────────────────────────────►│ POST /api/tasks      │
  │                │                           │                             │ spawn runner         │
  │                │                           │                             ├────────────────────►│ run(prompt)
  │                │ subscribe SSE stream      │                             │                     │
  │                ├────────────────────────────────────────────────────────►│ GET /api/tasks/:id/stream (SSE)
  │                │                           │                             │ stream deltas        │
  │                │◄────────────────────────────────────────────────────────┤ (tokens/lines)      │
  │                │ render “typing” outro     │                             │                     │
  │                │                           │                             │ Gemini returns JSON  │
  │                │                           │                             ◄─────────────────────┤ (final)
  │                │                           │                             │ validate JSON + IDs  │
  │                │◄────────────────────────────────────────────────────────┤ SSE: completed block │
  │                │ store NarrativeBlock      │                             │                     │
  │                │ render final narrative    │                             │                     │
  │                │                           │                             │                     │
  │                │ If Gemini fails/unavailable: show placeholder, keep game playable            │
````

### Notes / constraints

* Engine outcomes happen **before** narrative tasks are created.
* FactsBundle must contain **only resolved events** (no “roll next” requests).
* Narrative output is **validated** and can be dropped without affecting gameplay.

