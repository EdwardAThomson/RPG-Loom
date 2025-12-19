## Multiplayer Readiness Addendum

**Project:** RPG-Loom Chronicles (Idle RPG)
**Goal:** Ship single-player first, then add **asynchronous multiplayer** (Option 1) and later **co-op instanced dungeons** (Option 2). No real-time overworld.

---

# 1) Multiplayer scope and phases

## Phase 0 — Single-player baseline (now)

* Deterministic engine runs locally.
* Optional narrative layer (Gemini) runs locally or via gateway.
* Saves stored locally.

**Hard requirement:** Everything is driven by **Commands → Engine → Events**.

## Phase 1 — Online-lite async (future)

Adds:

* Accounts (optional at first)
* Cloud saves (authoritative snapshot storage)
* Leaderboards (daily/weekly)
* “World events” contributions (e.g., donate mats to rebuild the bridge)
* Guilds (chat optional; can start as “membership + shared progress”)

**No combat synchronization.** No “you must be online together.”

## Phase 2 — Instanced co-op dungeons (future)

Adds:

* Party of 2–4 players
* Dungeon run is an instance with:

  * fixed seed
  * deterministic encounter schedule
  * turn/tick-based resolution (not twitch)
* Players contribute actions via commands:

  * loadout + tactics preset + optional “ability priority”
* Option A (simpler): “async co-op”

  * everyone submits a plan window (e.g., 10 turns or 5 minutes)
  * server simulates and posts results
* Option B (near-sync but not real-time):

  * short turn deadlines (e.g., 10–30s)
  * still no interpolation/reconciliation complexity

---

# 2) Design principles for multiplayer readiness

## 2.1 Authoritative simulation boundary

Even in single-player, design as if:

* **Engine is authoritative**
* UI is untrusted
* AI is untrusted (narrative only)

Later, the server becomes the authority with minimal refactor.

## 2.2 Determinism and reproducibility

* All randomness comes from seeded RNG:

  * seed inputs must be stable (saveId, instanceId, tickIndex, encounterIndex, etc.)
* Engine must be **pure** given:

  * previous state
  * command list
  * “time inputs” (nowMs, offline window)
  * content version

## 2.3 Event sourcing mindset (lightweight)

You do *not* need full event-sourcing infrastructure now, but:

* Commands are append-only records
* Events are emitted records
* State is a snapshot that can be recreated (at least for debug)

This enables:

* anti-cheat validation (re-simulate)
* post-mortems (“how did this happen?”)
* replay and auditing for co-op instances

---

# 3) Required data contracts

## 3.1 Command contract

Commands are the only input from client → engine.

Properties:

* `commandId` (uuid)
* `playerId` (or `local`)
* `issuedAtMs`
* `type`
* `payload`
* `clientVersion` / `contentVersion` (for compatibility)

Rules:

* Commands must be idempotent (safe to retry).
* Command handlers must be deterministic.

## 3.2 Event contract

Events are the only output from engine → client UI.

Properties:

* `eventId`
* `atMs`
* `type`
* `payload`
* `correlationId` (commandId or instance tick id)

Rules:

* Events must include **facts**, not prose.
* AI consumes events; AI does not create events.

## 3.3 Snapshot contract

A snapshot is a complete state blob:

* `EngineState` (versioned)
* `contentVersion`
* `lastServerTimeMs` (in online mode)
* optionally a short command/event cursor for reconciliation

---

# 4) Client/server split (future online)

## 4.1 Single-player mode (local authority)

* Client runs engine locally.
* Gateway is optional (for narrative).
* Saves local.

## 4.2 Online async mode (server authority)

* Client sends commands to server.
* Server simulates ticks/offline windows and returns:

  * new snapshot
  * event batch
* Client may still run a “preview sim” locally for responsiveness, but it’s cosmetic.

### Why server-authoritative for async?

* Leaderboards and shared systems need trust.
* Prevents trivial save editing for competitive modes.
* Makes co-op instance integrity possible.

---

# 5) Anti-cheat approach (pragmatic)

Idle games don’t need esports-grade anti-cheat; they need “don’t let obvious exploits ruin shared systems.”

## 5.1 Phase 1 (async) minimum

* Server authority for:

  * leaderboard submissions
  * world event contributions
  * guild progression
* Rate limiting and sanity checks:

  * tick windows cannot exceed plausible elapsed time
  * resource gains must be within deterministic bounds

## 5.2 Phase 2 (co-op instances)

* Server runs instance sim only.
* Client supplies commands/plans; cannot supply outcomes.
* All rewards originate on server.

---

# 6) Content versioning and migration

Required from day one:

* Stable IDs for content (itemId, enemyId, locationId, questTemplateId)
* `contentVersion` embedded in save/snapshots
* Migration path:

  * When content changes, either:

    * migrate snapshots forward with a script, or
    * pin old saves to old content pack (simpler early)

---

# 7) Co-op instance design (Option 2)

## 7.1 Instance lifecycle

* Create instance:

  * `instanceId`
  * `seed`
  * `dungeonTemplateId`
  * party roster
  * start time and deadlines
* Run:

  * collect player “plans” per window (turn batch)
  * simulate deterministically
  * emit events and updated instance state
* Complete:

  * distribute rewards
  * write summary/journal (AI optional)

## 7.2 Player contribution model (keep it simple)

Each player provides:

* loadout (equipment)
* tactics preset
* optional “priority rules” (JSON)
* consumable usage thresholds

Avoid:

* freeform “cast any skill now” in MVP co-op (too many sync edge cases)

## 7.3 Failure and drop-in/out

Support:

* A player missing a window → default to “Balanced” autopilot
* Disconnects don’t break the run
* Party can continue with bots (see below)

---

# 8) Bots and AI “players”

Bots are first-class citizens and help both SP and MP.

## 8.1 Bots generate commands, not outcomes

* A bot is a module that:

  * reads snapshot + recent events
  * outputs commands a player could output

## 8.2 Narrative AI vs gameplay bot AI

* Narrative AI: writes flavor text, journal, NPC dialogue
* Gameplay bot: chooses activities, loadouts, tactics
  Keep these separate to prevent “AI decides loot/combat.”

---

# 9) What we must do now (no server yet)

### Required now (cheap, high leverage)

* Keep engine pure + deterministic
* Commands and events are the only interface
* Stable content IDs + content version stamping
* Time is an explicit input to simulation
* No UI-driven state mutation shortcuts

### Avoid now (causes pain later)

* Randomness from `Math.random()` scattered anywhere
* Logic depending on local timezone/clock implicitly
* “Magic UI flags” that change outcomes but aren’t in state/commands
* AI-generated new items/enemies/locations without IDs and validation

---

# 10) Phase 1 API sketch (when you’re ready)

* `POST /auth/login` (optional)
* `POST /saves/:id/commands` → submit commands (idempotent)
* `POST /saves/:id/simulate` → server simulates to now, returns snapshot + events
* `GET /leaderboards/:boardId`
* `POST /guilds/:id/contribute` (server-validated contributions)
* `POST /instances` (Phase 2)
* `POST /instances/:id/plans`
* `POST /instances/:id/simulate`
