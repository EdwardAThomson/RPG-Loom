# Milestone Checklist

## Milestone A — Engine Foundations (Determinism + Save/Load + Offline)

**Goal:** Engine is authoritative, deterministic, testable, and can simulate offline progress.

### A1. Define canonical types + zod schemas (shared)

* **Deliverable:** `packages/shared` exports TypeScript interfaces + zod validators for:

  * `EngineState`, `CommandEnvelope`, `GameEvent`, `Content` IDs, `NarrativeFactsBundle`
* **Acceptance:**

  * All inbound commands validated before engine applies them
  * All engine events validated in tests (no malformed payloads)

### A2. Seeded RNG utility with zero `Math.random()` leakage

* **Deliverable:** `packages/engine/src/rng.ts` provides seeded RNG + helpers (pickWeighted, roll, hashSeed)
* **Acceptance:**

  * Lint/test detects any `Math.random()` usage in engine package
  * Given same seed, RNG output is identical across runs

### A3. Engine step loop (online ticks)

* **Deliverable:** `step(state, nowMs)` processes N ticks based on elapsed time (bounded)
* **Acceptance:**

  * `step` is pure (no IO, no time reads)
  * `ticksProcessed` never exceeds cap (configurable)

### A4. Offline simulation (batching + safeguards)

* **Deliverable:** `simulateOffline(state, fromMs, toMs)` with chunking
* **Acceptance:**

  * Can simulate 24 hours without crashing
  * Outputs summary (xp/items/encounters)
  * Deterministic repeated runs

### A5. Command application layer

* **Deliverable:** `applyCommand(state, commandEnvelope)` dispatches to handlers
* **Acceptance:**

  * Commands are idempotent by `commandId` (dedupe set in state cursor or caller)
  * Invalid commands return `ERROR` event without corrupting state

### A6. Save/load format and migrations stub

* **Deliverable:** Serializer + `engineVersion/contentVersion` stamping + migrations folder
* **Acceptance:**

  * Loading older version fails gracefully or migrates forward (even if “v1 only” for now)
  * Snapshots are stable JSON (canonical ordering optional)

### A7. Engine invariants test suite

* **Deliverable:** property tests + “golden snapshot” tests
* **Acceptance:**

  * Invariants: inventory never negative, xp monotonic (unless explicit), IDs valid
  * Golden test: fixed seed yields identical state hash after 10k ticks

---

## Milestone B — Playable MVP Loop (Progression + Content + Balance Knobs)

**Goal:** The game is fun for 30–60 minutes without AI.

### B1. Activities v1: hunt/gather/train/craft/quest

* **Deliverable:** Activity resolver supports:

  * `hunt`, `gather`, `train`, `craft`, `quest`
* **Acceptance:**

  * Each activity yields something measurable per time
  * Switching activity emits `ACTIVITY_SET` and resets appropriate timers

### B2. Combat v1: deterministic, tactics presets, outcomes

* **Deliverable:** Combat module with:

  * Aggressive/Balanced/Defensive presets
  * win/loss/escape resolution
* **Acceptance:**

  * Same encounter seed => same combat log events and outcome
  * Death/loss has a deterministic penalty (time loss, durability, gold sink, etc.)

### B3. Encounters v1: per-location encounter tables

* **Deliverable:** Each location defines:

  * encounter rate
  * enemy weights
  * resource/loot tables
* **Acceptance:**

  * You can “feel” location identity (e.g., forest = herbs/pelts, ruins = relic/bone)

### B4. Quest system v1: templates → instances → progress

* **Deliverable:** Implement:

  * `QuestTemplate` (kill/gather/craft/explore)
  * `QuestInstance` state machine (active/completed/failed)
  * progress events
* **Acceptance:**

  * At least 10 templates generate instances correctly
  * Completing a quest yields deterministic reward pack

### B5. Inventory + stacking + equipment bonuses

* **Deliverable:** Inventory supports stacking for materials/consumables; equipment modifies stats
* **Acceptance:**

  * Equip/unequip changes derived stats immediately
  * Stacks merge deterministically; no duplication bugs

### B6. Crafting v1: recipes + quality chance

* **Deliverable:** 8–12 recipes; optional “uncommon quality” via deterministic roll
* **Acceptance:**

  * Recipe requirements validated
  * Craft emits `ITEMS_CONSUMED` + `ITEMS_GAINED` events

### B7. Economy sinks v1 (anti-inflation)

* **Deliverable:** Add at least 3 sinks:

  * training costs
  * crafting costs
  * repairs/durability or travel fee or quest entry cost
* **Acceptance:**

  * You can’t snowball infinitely without making choices
  * Gold/materials remain meaningful

### B8. Content pack v1 (minimum fun set)

* **Deliverable:** JSON content with at least:

  * 5 locations
  * 12 enemies
  * 40 items (gear/consumables/materials)
  * 20 quest templates
  * 12 recipes
  * 5 NPCs (mechanical roles)
* **Acceptance:**

  * Content validation script passes
  * No missing IDs referenced anywhere

### B9. Balance instrumentation

* **Deliverable:** Engine outputs (or UI computes) rolling rates:

  * XP/hr, gold/hr, key material/hr
* **Acceptance:**

  * Rates are stable enough for balancing
  * Can export a debug “run report” JSON

---

## Milestone C — UI MVP (Clarity + Speed + No Confusion)

**Goal:** Players understand the loop instantly.

### C1. Activity screen “home”

* **Deliverable:** Main screen shows:

  * current activity, location, progress
  * recent events grouped by tick batch
* **Acceptance:**

  * Player can start/stop/switch activities in < 3 clicks

### C2. Character screen

* **Deliverable:** Stats, equipment slots, tactics preset, potion threshold toggles
* **Acceptance:**

  * Changes are immediately reflected in derived stats

### C3. Inventory screen

* **Deliverable:** Filters (gear/consumables/materials), stacks, inspect panel
* **Acceptance:**

  * No scroll pain at 100+ items (pagination or virtual list if needed)

### C4. Quest screen

* **Deliverable:** Active quest cards with progress bars, reward preview
* **Acceptance:**

  * Completing a quest produces a clear “claim/complete” moment (even if auto-claimed)

### C5. Persistence UX

* **Deliverable:** Save slot list, export/import save JSON
* **Acceptance:**

  * A player can back up a save and restore it successfully

### C6. Debug panel (dev-only)

* **Deliverable:** seed display, tick rate, event stream viewer, “simulate 1h/8h/24h” buttons
* **Acceptance:**

  * Helps reproduce bugs quickly

---

## Milestone D — Optional AI Narrative (Gemini) with Strict Guardrails

**Goal:** Narrative adds life, never breaks the game, and is optional.

### D1. FactsBundle builder

* **Deliverable:** Convert recent `GameEvent[]` into a `NarrativeFactsBundle`
* **Acceptance:**

  * Bundle contains only factual resolved outcomes
  * Bundle hash stable across runs

### D2. Prompt templates (JSON-only outputs)

* **Deliverable:** Templates for:

  * quest_flavor, npc_dialogue, rumor_feed, journal_entry
* **Acceptance:**

  * Prompts include strict instructions: no new IDs, length budgets, JSON only

### D3. Gemini backend in gateway

* **Deliverable:** `gemini-cli` backend:

  * runs tasks
  * streams output to SSE
  * timeouts/cancellation
* **Acceptance:**

  * If Gemini is missing, backend falls back to mock with clear status
  * Gateway never crashes from LLM output

### D4. Narrative output validator

* **Deliverable:** Validate returned JSON:

  * schema
  * no invented references
  * length constraints
* **Acceptance:**

  * Invalid output is rejected and replaced with a safe fallback block

### D5. Narrative store per save slot

* **Deliverable:** Persist `NarrativeBlock[]` alongside the save
* **Acceptance:**

  * Reloading a save restores journal + quest flavor

### D6. UI integration

* **Deliverable:** Render narrative blocks in:

  * quest cards
  * NPC dialogue panels
  * journal tab
* **Acceptance:**

  * If AI is off, UI still works and displays deterministic logs only

---

## Milestone E — Content Expansion + Balance Pass

**Goal:** Longer-term play (days/weeks), variety, and meaningful builds.

### E1. More zones + a mid-boss arc

* **Deliverable:** 10–12 locations + 3 bosses with deterministic phases
* **Acceptance:**

  * Clear tier progression and gating (level/rep/items)

### E2. Build depth

* **Deliverable:** item tags + synergies + status effects (poison/bleed/stun)
* **Acceptance:**

  * At least 3 viable archetypes (melee tank / ranged crit / arcana control)

### E3. Reputation + faction progression

* **Deliverable:** faction rep gates quests/shops/locations
* **Acceptance:**

  * Rep becomes a meaningful long-term axis, not just a number

### E4. Balance tooling

* **Deliverable:** scripted simulations for expected rates by tier (headless)
* **Acceptance:**

  * You can run “1k simulated players” style sweeps for tuning

---

## Milestone F — Async Online (Future)

**Goal:** Online features without real-time.

### F1. Accounts + cloud save snapshots

### F2. Server-authoritative leaderboards

### F3. Guilds + world events

### F4. Market (optional, high design cost)

(We can expand this later when you’re ready.)

---

## Milestone G — Instanced Co-op Dungeons (Future)

**Goal:** Co-op without twitch requirements.

### G1. Instance model + roster + seed

### G2. Plan submission window (async)

### G3. Server simulation + rewards + summary

### G4. Drop-in/out autopilot and bot fill

---

# Suggested next build order (so you don’t thrash)

1. **A1–A7** (engine correctness is compounding value)
2. **B1–B7** (core loop + sinks)
3. **C1–C5** (clarity makes testing/balance easier)
4. **B8–B9** (content + instrumentation)
5. **D1–D6** (Gemini narrative as polish)

