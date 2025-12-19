# RPG Loom Plan

## 0) Guiding decisions

* **Deterministic engine is the game.** It must be fun and complete without AI.
* **AI is a presentation layer** (quest flavor, NPC dialogue, journal). It never decides outcomes.
* **Future multiplayer = async first**, then **instanced co-op** (turn/tick based; no real-time netcode).
* Build “multiplayer-shaped” now: Commands → Engine → Events, versioned state/content, explicit time inputs.

---

## 1) What’s missing right now

### Core gameplay gaps (must-have for MVP)

* A complete **activity loop** (hunt/gather/quest/craft/train) with meaningful progression
* A minimal-but-real **combat loop** (tactics preset + death/escape handling + recovery)
* **Quest system** that integrates with activities and emits progress/completion events
* **Economy**: gold/material sinks so “numbers go up” doesn’t trivialize progression
* **Persistence**: robust save/load + offline catch-up simulation

### Product/UX gaps (must-have for MVP)

* UI that makes it clear:

  * what you’re doing
  * what you’re gaining per unit time
  * what unlocks next
* Basic inventory management and equipment screen
* A readable event log (and later, narrative log)

### Optional-but-important foundations (nice to do early)

* Content pipeline: JSON content with validation (schema + IDs) + dev tooling
* Test harness for determinism (golden tests)
*   Content pipeline: JSON content with validation (schema + IDs) + dev tooling
*   Test harness for determinism (golden tests)
*   Gateway hardening baseline (timeouts, cancellation, sandbox constraints)

---

## 2) Plan overview by milestones

## Milestone A — Engine Foundations (Determinism + Save/Load + Offline)
 
 **Goal:** Engine is authoritative, deterministic, testable, and supports offline progress.
 
 * **A1. Canonical Types + Zod Schemas**: Shared `EngineState`, `CommandEnvelope`, `GameEvent` definitions.
 * **A2. Seeded RNG**: Secure, seeded random utility (no `Math.random()`).
 * **A3. Engine Step Loop**: Pure function `step(state, nowMs)` with tick bounding.
 * **A4. Offline Simulation**: `simulateOffline` with chunking for large time gaps.
 * **A5. Command Application**: Idempotent `applyCommand` handlers.
 * **A6. Save/Load Format**: Versioned snapshots + migration stubs.
 * **A7. Invariants Test Suite**: Golden snapshot tests + property tests.

---

## Milestone B — Playable MVP Loop (Progression + Content)
 
 **Goal:** A player can “play” for 30–60 minutes and feel progression without boredom.
 
 * **B1. Activities v1**: Hunt, Gather, Train, Craft, Quest resolvers.
 * **B2. Combat v1**: Deterministic module, tactics presets, death penalties.
 * **B3. Encounters v1**: Per-location tables (rates, weights, loot).
 * **B4. Quest System v1**: Templates → Instances → Progress events.
 * **B5. Inventory & Gear**:/Stacking logic + equipment stats.
 * **B6. Crafting v1**: Recipes + quality chance.
 * **B7. Economy Sinks**: Repair/training costs to prevent inflation.
 * **B8. Content Pack v1**: 5 locations, 12 enemies, 40 items, 20 quests.
 * **B9. Balance Instrumentation**: XP/hr and Gold/hr rate tracking.

---

## Milestone C — UI MVP (Clarity + Speed)
 
 **Goal:** A clean, icon-friendly UI that makes the deterministic loop satisfying.
 
 * **C1. Activity Screen (Home)**: Centerpiece UI, start/stop/switch activities.
 * **C2. Character Screen**: Stats, tactics, loadout.
 * **C3. Inventory Screen**: Filters, stacks, inspection.
 * **C4. Quest Screen**: Active cards, rewards, claim UI.
 * **C5. Persistence UX**: Save slots, import/export.
 * **C6. Debug Panel**: Seed display, tick rate, fast-forward buttons.

---

## Milestone D — AI Narrative (Optional Plugin)
 
 **Goal:** Add narrative without risking core gameplay.
 
 * **D1. FactsBundle Builder**: Engine events → Facts packet for LLM.
 * **D2. Prompt Templates**: Strict JSON-only instructions (Quest flavor, NPC, Rumors).
 * **D3. Gateway Backend**: Gemini CLI support + Mock fallback + SSE streaming.
 * **D4. Output Validator**: Schema + ID check + Length budget.
 * **D5. Narrative Store**: Persist blocks per save slot.
 * **D6. UI Integration**: Narratives display in Journal/Quest/NPC panels.

---

## Milestone E — Content Expansion + Balance Pass

**Goal:** Make the game “idle-sticky” (build depth, long-term goals).

Deliverables:

* More locations, rare drops, recipe tiers, reputation gates
* Bosses with deterministic phases
* Deeper equipment variety (tags, synergies)
* Balance metrics:

  * time-to-upgrade curves
  * expected gains per location tier
  * death rates by tier (shouldn’t be random-feels-bad)

Acceptance criteria:

* There’s always an obvious next goal, and multiple viable paths to pursue it.

---

## Milestone F — Async Online Features (future)

**Goal:** Add online without real-time netcode.

Order:

1. Accounts + cloud saves (server stores snapshots)
2. Leaderboards (weekly/monthly)
3. Guilds + world events contributions
4. Market/trading (optional; big design implications)

Acceptance criteria:

* Server-authoritative where shared systems exist.
* Client stays usable offline (at minimum: local play + later sync).

---

## Milestone G — Instanced Co-op Dungeons (future)

**Goal:** Co-op without real-time complexity.

Approach:

* Server hosts dungeon instances (seeded, deterministic)
* Players submit “plans” (loadout + tactics + thresholds) per window
* Server simulates and returns events + rewards + summary

Acceptance criteria:

* Drop-in/out handled gracefully (autopilot fallback).
* No “desync”—server is the authority.

---

## 3) Workstreams and what to build next

### Workstream 1: Engine

Next tasks:

* Flesh out activity resolution tables per location (encounter rate, resource yields)
* Combat module with tactics + consumable thresholds
* Quest progress hooks (events drive quest state updates)
* Offline batching safeguards (max ticks, chunking)

### Workstream 2: Content + schemas

Next tasks:

* Define zod schemas for all content JSON + IDs
* Add a content validation script (fails CI if invalid)
* Expand content to hit Milestone B scope

### Workstream 3: UI

Next tasks:

* Activity screen becomes the “home”
* Inventory filters + equipment slots
* Quest tracker + progress bars
* A simple “what changed this tick” log grouping

### Workstream 4: Gateway + narrative

Next tasks:

* Keep mock backend as default
* Add Gemini backend behind feature flag
* Implement FactsBundle + validation rules
* Store narrative blocks per save slot

### Workstream 5: Testing + tooling

Next tasks:

* Golden determinism tests for engine
* Smoke test runner (“simulate 10k ticks, ensure invariants”)
* Basic CI: typecheck + unit tests + content validation

---

## 4) Risks and mitigations

* **Scope creep (multiplayer too early):** enforce milestone gates; Phase 1 is SP only.
* **Balance pain:** add sinks early; instrument rate readouts; do small balance passes often.
* **AI unpredictability:** JSON-only outputs + strict validators + fallback to mock.
* **Security of CLI runner:** default to local gateway; sandbox later; strict timeouts/cancel.

---

## 5) Immediate next step recommendation

If you want the most momentum with least regret:

1. Finish **Milestone A** (engine determinism + offline + save/load + tests)
2. Push to **Milestone B** (playable loop with enough content to feel real)
3. Then do **Milestone C** (UI clarity)
4. Only then wire **Milestone D** (Gemini narrative)

That order guarantees the game is fun even if AI is flaky.
