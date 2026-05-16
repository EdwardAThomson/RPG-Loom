# Roadmap: Near-term plan

Captured 2026-05-14. This is a **near-term plan layered on `docs/plan.md`**, not a replacement for it. The phases here all fit inside or alongside Milestone E (AI Narrative) and an early F1; they're chosen to make the existing systems feel finished before adding new content.

If this conflicts with `docs/plan.md`, plan.md wins — update this doc or close the gap.

---

## Ship order (TL;DR)

1. ~~**Phase 1** — Offline catch-up summary (1–2 days)~~ ✅ shipped
2. ~~**Phase 4a** — Save versioning + migration (1 day, unblocks Phase 3)~~ ✅ shipped
3. **Phase 2** — Next-goal widget (2–3 days) — **next**
4. **Phase 4b–4d** — Cloud saves end-to-end (~1 week)
5. **Phase 3a–3c** — Recurring NPCs (~1–2 weeks)
6. **Phase 4e** — Narrative store (2 days, closes Milestone E5)

Total: ~6 weeks. See "Sequencing" near the bottom for the dependency diagram and rationale.

---

## Why these phases

A code read on 2026-05-14 (see `docs/known_gaps.md`) flagged that the engine, content, and AI plumbing are largely done, but several systems that would multiply their value haven't shipped:

1. **Offline catch-up summary** — `simulateOffline` already produces the data; nothing surfaces it.
2. **Next-goal widget** — `docs/plan.md` says "there's always an obvious next goal"; the UI doesn't deliver that today.
3. **Recurring NPCs** — `NpcDef` and `npc_dialogue` exist as types but no NPCs are in content and no NPC UI exists. Closing this loop is what makes the AI investment feel structural rather than decorative.

Phase 1 and 2 are pure additive work. Phase 3 forces (and benefits from) finishing Milestone E's ID-validator; the save-versioning prerequisite is satisfied by Phase 4a (already shipped).

---

## Phase 1 — Offline catch-up summary

**Advances:** `plan.md` Milestone A4 (offline simulation) — the engine function is done; this surfaces it in the UI. No new milestone required.

**Goal:** Returning after >60s away, the player sees a modal: "While you were gone: 142 kills, +1,820 XP, 4 items, 1 quest complete."

**Size:** 1–2 days.

**Engine status:** `simulateOffline(state, fromMs, toMs, content)` already exists and returns `{ state, events }`. `useGameEngine`'s tick loop already replays elapsed time via `step` — it just doesn't surface anything special.

### Work

| File | Change |
|---|---|
| `packages/engine/src/engine.ts` | Add a tick cap to `simulateOffline` — clamp `(toMs - fromMs)` to e.g. 24h so reopening after a week doesn't simulate forever. |
| `packages/shared/src/types.ts` | New type `OfflineSummary = { durationMs, kills: Record<EnemyId, number>, loot: Record<ItemId, number>, xpGained, goldDelta, questsCompleted, levelUps }`. |
| `packages/engine/src/engine.ts` *or* new `packages/engine/src/summary.ts` | Pure function `summarizeEvents(events: GameEvent[]): OfflineSummary`. Roll up the existing event stream by type. |
| `web/src/hooks/useGameEngine.ts` | On mount: if `Date.now() - state.lastTickAtMs > 60_000`, call `simulateOffline` instead of `step`, build summary, expose via `pendingOfflineSummary`. |
| `web/src/components/OfflineSummaryModal.tsx` | New component. Renders the summary, "Continue" dismisses. |
| `web/src/App.tsx` | Mount modal when `pendingOfflineSummary` is set. |

### Acceptance

- Coming back after >60s shows the modal.
- 24h+ offline doesn't freeze the browser (capped sim).
- Summary numbers match the event stream (vitest test against a fixed-seed offline run).
- Closing the tab and reopening immediately (no real elapsed time) doesn't show the modal.

### Risks

None structural. The biggest gotcha is that `summarizeEvents` is the kind of pure function that benefits from a vitest test — fixed seed in, expected summary out. Matches the acceptance criteria perfectly.

---

## Phase 2 — Next-goal widget

**Advances:** Cross-milestone UI polish. Realizes `plan.md`'s "there's always an obvious next goal" guidance (Milestone D acceptance criterion) — the engine and content support it, the UI doesn't deliver it yet.

**Goal:** A persistent 1–3-item panel showing the closest achievable progress markers. Click → jump to relevant tab.

**Size:** 2–3 days.

### Work

| File | Change |
|---|---|
| `packages/shared/src/types.ts` | New `Goal = { id, label, progress: { current, required }, category: 'recipe' \| 'location' \| 'quest' \| 'skill' \| 'reputation', actionHint?: { tab, locationId?, recipeId?, questId? } }`. |
| `packages/engine/src/engine.ts` | New exported `getNextGoals(state, content, limit = 3): Goal[]`. Scan: (a) recipes where the player is within N skill levels of `requiredSkillLevel`, (b) locations where the player is within N of `requirements.minLevel`/`minSkills`/`minAtk`/`minDef`, (c) active quest progress, (d) chain-quest next-step unlocks, (e) the closest single skill milestone. Rank by "distance to unlock" (fewest missing reqs → smallest gap). |
| `web/src/components/NextGoalsPanel.tsx` | New component. Renders the top N goals as progress bars. Each goal carries an `actionHint` that wires up "go to Crafting" / "go to Travel" / "go to Quest" buttons. |
| `web/src/App.tsx` | Mount panel above or beside the tab content (always-visible). |

### Acceptance

- A new player sees 3 obvious next things to do (e.g. unlock first recipe, reach combat lvl 5, accept first quest).
- A mid-game player sees the next recipe tier, next location, and current active quest progress.
- A player who has done everything in the current content tier sees a graceful empty state.

### Tradeoffs

- Put `getNextGoals` in `@rpg-loom/engine` (not `web/`) so balance sims and future automated tests can use it. It's read-only on `state + content`, so it doesn't break engine purity.
- "Distance to unlock" needs a heuristic. Start simple: count missing requirement deltas, sum them with weights. Iterate from playtesting.
- Don't try to surface adventure-quest sub-steps here — let `QuestView` continue to handle those. The widget is the *macro* compass.

---

## Phase 3 — Recurring NPCs

**Advances:** `plan.md` Milestone E2 (prompt templates for `npc_dialogue`), E4 (forces the no-invented-IDs validator), E6 (NPC dialogue panels in the UI). Not a numbered E sub-task but the feature that makes E land as a coherent product.

**Goal:** A roster of ~10 persistent NPCs across the world. They give quests, remember prior interactions, and have AI-flavored personalities cached per save. The game starts feeling like "a guild," not a vending machine.

**Size:** 1–2 weeks, split into three sub-phases.

### 3a — NPC content + engine state (~3 days)

| File | Change |
|---|---|
| `packages/content/data/npcs.json` | New file. Hand-author 10–12 NPCs: `{ id, name, role, locationId, personaCardId, prompts: { greeting, questIntro, ... } }`. Roles already in `types.ts`: `quartermaster, scout_captain, apothecary, scholar, emissary, generic`. |
| `packages/content/data/index.ts` | Load `npcs.json`; add to `ContentIndex.npcsById`. |
| `packages/shared/src/types.ts` | Add `npcsById: Record<NpcId, NpcDef>` to `ContentIndex`. Add `npcState: Record<NpcId, { firstMetAtMs?, lastInteractionMs?, affinity: number, generatedFlavor?: { description, dialogueLines } }>` to `EngineState`. Bump `CURRENT_ENGINE_VERSION` to `2` and add an `incoming < 2` branch in `migrateState` that fills `npcState` with `{}`. (Phase 4a already shipped the versioning + migration infrastructure.) |
| `packages/engine/src/engine.ts` | New commands: `TALK_TO_NPC { npcId, atMs }` (records interaction, +1 affinity) and `ACCEPT_QUEST_FROM_NPC { npcId, templateId, atMs }` (links quest to NPC). Migration helper: `ensureNpcState(state)`. |
| `packages/engine/src/engine.ts` | Modify `getAvailableQuests` to filter quest templates by NPC location + relationship (some templates need affinity ≥ N). Also a good moment to fix `getAvailableQuests`'s `Date.now()` violation from `known_gaps.md` §1. |

### 3b — UI for NPC interaction (~3 days)

| File | Change |
|---|---|
| `web/src/components/NpcsView.tsx` | New tab. Lists NPCs at current location. Each shows name, role, last interaction, affinity, available quests. |
| `web/src/components/Navigation.tsx` | Add "NPCs" tab. |
| `web/src/components/NpcDialogueModal.tsx` | Modal for a single NPC conversation. Shows cached `generatedFlavor.dialogueLines` and a "Talk to them" button that triggers AI dialogue generation (Phase 3c). |
| `web/src/components/QuestView.tsx` | When a quest has an `npcId`, link to "Return to {NPC name} at {location}". |

### 3c — AI flavor pipeline (~3 days)

| File | Change |
|---|---|
| `web/src/services/npcDialogue.ts` | New service. On first interaction with an NPC, build a `NarrativeTask { type: 'npc_dialogue', references: { npcId, locationId }, facts: { npc: npcDef, recentEvents, affinity } }`. Cache result in `EngineState.npcState[npcId].generatedFlavor`. Reuse the cached output on subsequent visits so the NPC stays "the same person." |
| `gateway/src/server.ts` | Already accepts `npc_dialogue` task type — no change needed beyond the validation fix below. |
| `gateway/src/server.ts` | **Prerequisite:** wire up the no-invented-IDs validator from `docs/known_gaps.md` §3 (Milestone E4). NPCs can't reliably reference items/locations until this lands. |
| `web/src/services/adventureQuestGeneration.ts` | Tweak adventure prompts to optionally tie an adventure to a specific NPC ("{NPC name} asks you to..."), pulling from `npcsById`. |

### Acceptance

- 10+ NPCs visible across the world, each in their authored location.
- Talking to an NPC the first time triggers AI flavor generation; subsequent visits show the cached result instantly.
- Quests display "given by {NPC name}" and direct the player back on completion.
- Old saves migrate cleanly to `version: 2` with empty `npcState`.
- Game remains fully playable with the gateway offline (NPCs fall back to authored prompts in `npcs.json`).

### Risks

- First feature that *requires* the Milestone E ID-validator to land first, or AI-generated NPC dialogue will reference non-existent items. Plan to do that work as part of 3c.
- Depends on save versioning being real — fixed in Phase 4a (or as a prerequisite carved out of 3a if 4 hasn't started).

---

## Phase 4 — Cloud persistence (Postgres-backed saves)

**Advances:** `plan.md` Milestone F1 (Accounts + cloud saves), pulled forward from future. Phase 4e additionally closes `plan.md` Milestone E5 (Narrative Store). Phase 4a (versioning) closed the longstanding A6/save-versioning aspiration (previously `known_gaps.md` §2; removed once shipped).

**Goal:** Move authoritative save storage from `localStorage` to a Postgres-backed cloud store, with auth, multi-device sync, and a foundation for narrative storage. Lays the groundwork for `plan.md` Milestone F1 ("Accounts + cloud saves") without committing to server-authoritative simulation.

**Size:** ~2 weeks, split into five sub-phases. Parallel-safe with Phases 1 and 2; should land before Phase 3.

### Design principles

- **Dumb snapshot store.** Postgres holds the full `EngineState` as a `jsonb` column per save slot. Client stays authoritative for simulation; deterministic engine means we can upgrade to server-authoritative later by re-simulating from a snapshot.
- **Postgres is the target, Supabase is one possible host.** Use Supabase Auth if convenient (the user already runs it in another project), but treat it as a replaceable adapter. Migrating away = swap auth provider, `pg_dump | pg_restore` to new host, point `DATABASE_URL` elsewhere.
- **No Supabase lock-in for data.** Use plain Postgres via `pg` (or Drizzle/Kysely for types). **Do not** use `@supabase/supabase-js` for data access. No Supabase Realtime, Storage, or Edge Functions. RLS is acceptable as defense-in-depth but never the only check.
- **Last-write-wins with conflict surfacing.** No CRDT, no event log, no fancy merging. Idle game, no PvP — keep it simple.

### Schema (MVP)

```sql
create table users (
  id            uuid primary key,
  external_id   text not null unique,         -- 'supabase:abc123', 'oauth:google:...', etc.
  display_name  text,
  created_at    timestamptz not null default now()
);

create table saves (
  id              uuid primary key,
  user_id         uuid not null references users(id) on delete cascade,
  slot            int  not null,              -- 1..N per user (3 slots is typical)
  engine_version  int  not null,              -- matches EngineState.version
  content_version text not null,              -- pin to a content hash/tag
  state           jsonb not null,             -- the full EngineState
  generation      bigint not null default 1,  -- bumps on every write, used for conflict checks
  updated_at      timestamptz not null default now(),
  unique (user_id, slot)
);

create index saves_user on saves(user_id);

-- Foundation for Milestone E5 (Narrative Store) and future leaderboards.
create table narrative_blocks (
  id          uuid primary key,
  save_id     uuid not null references saves(id) on delete cascade,
  type        text not null,                  -- 'quest_flavor' | 'npc_dialogue' | ...
  refs        jsonb not null,                 -- { questId, npcId, ... }
  block       jsonb not null,                 -- NarrativeBlockDTO
  created_at  timestamptz not null default now()
);
```

That's the whole MVP schema. `EngineState` is small enough (~few KB) that `jsonb` handles it fine. Skip an event log until something needs it.

### API (lives in the existing `gateway/`)

Add `gateway/src/persistence/` and `gateway/src/auth/` modules — don't spin up a second service.

```
POST   /api/auth/exchange      // verify external token → return our session token
GET    /api/saves               // list user's slots (metadata only)
GET    /api/saves/:slot         // fetch one save
PUT    /api/saves/:slot         // upsert; body includes { generation, state }
DELETE /api/saves/:slot
```

`PUT` does the conflict check: if `body.generation < db.generation`, return 409 with the server's version. Client decides whether to overwrite or keep local.

### 4a — Versioning + migration (~1 day, prerequisite for everything) ✅ shipped

| File | Change |
|---|---|
| `packages/shared/src/types.ts` | `EngineState.engineVersion: number` (was hard-coded `version: 1`) and `contentVersion: string`. |
| `packages/engine/src/engine.ts` | New exported `migrateState(state, contentVersion): EngineState`. Folds the existing ad-hoc helpers (`ensureIntrinsicStats`, `ensureQuestAvailability`, `ensureAllSkills`) into one ordered migration. New saves get current versions. Old saves get migrated forward and re-stamped. |
| `packages/content/data/index.ts` | Compute or hardcode a `CONTENT_VERSION` tag and export it. |
| `web/src/hooks/useGameEngine.ts` | Call `migrateState` on every load — both localStorage and (later) cloud. Refuse loads with `engineVersion > current`. |

Closed `known_gaps.md` §2 (entry removed from that doc once shipped).

### 4b — Schema + read-only API (~2 days) ✅ shipped

| File | Change |
|---|---|
| `gateway/package.json` | Add `pg` (or `drizzle-orm` + `postgres`). Add `DATABASE_URL` env var. |
| `gateway/src/persistence/db.ts` | Thin pool wrapper. Reads `DATABASE_URL`. |
| `gateway/src/persistence/schema.sql` | The DDL above. Apply via `psql` for now; introduce a migration tool (drizzle-kit / node-pg-migrate) if/when needed. |
| `gateway/src/persistence/saves.ts` | `listSaves(userId)`, `getSave(userId, slot)`. |
| `gateway/src/server.ts` | Mount `GET /api/saves` and `GET /api/saves/:slot`. Use a hardcoded dev user; no auth yet. |

Proves the gateway can talk to Postgres end-to-end.

### 4c — Auth abstraction + write API (~3 days)

| File | Change |
|---|---|
| `gateway/src/auth/AuthProvider.ts` | Interface: `verifyToken(token): Promise<{ externalId, displayName? } \| null>`. |
| `gateway/src/auth/supabase.ts` | `SupabaseAuthProvider` — verifies a Supabase JWT against the project's JWKS. No `@supabase/supabase-js` dependency; verify the JWT directly with `jose` so swapping is trivial. |
| `gateway/src/auth/dev.ts` | `DevAuthProvider` — accepts any token, returns a fixed test user. Used in local dev. |
| `gateway/src/server.ts` | `requireAuth` middleware: extracts token from `Authorization`, calls provider, attaches `req.user`. All `/api/saves/*` routes use it. Add `POST /api/auth/exchange`, `PUT /api/saves/:slot`, `DELETE /api/saves/:slot`. Conflict check on PUT. |
| `gateway/src/persistence/users.ts` | `findOrCreateUser(externalId, displayName)`. |

Auth provider is chosen via `AUTH_PROVIDER=supabase|dev|...` env var.

### 4d — Client sync (~3 days)

| File | Change |
|---|---|
| `web/src/services/auth.ts` | New. `signIn`, `signOut`, `getToken`. Wraps whichever auth client is configured (initially Supabase JS Auth — that part of Supabase JS is fine to use, since it's just an OAuth client). |
| `web/src/services/cloudSave.ts` | New. `fetchSave(slot)`, `pushSave(slot, state, generation)`, returns conflict info. Uses `gatewayFetch`. |
| `web/src/hooks/useGameEngine.ts` | On mount: try cloud → fall back to localStorage. Periodic push (every N ticks or after major events like quest completion). localStorage remains the offline cache so the game still works gateway-offline. |
| `web/src/components/SettingsModal.tsx` | Sign-in / sign-out controls. "Sync now" button. Conflict-resolution prompt when 409 returned. |

### 4e — Narrative store (~2 days)

| File | Change |
|---|---|
| `gateway/src/persistence/narrative.ts` | `saveNarrativeBlock(saveId, block)`, `listNarrativeBlocks(saveId, filter?)`. |
| `gateway/src/server.ts` | When a `NarrativeTask` succeeds, also persist its block keyed by save. New endpoints: `GET /api/saves/:slot/narrative`. |
| `web/src/services/journal.ts` | New. Fetches narrative blocks for the current save. |
| `web/src/components/JournalView.tsx` | New. Renders accumulated narrative history. |

Closes Milestone E5 ("Narrative Store: Persist blocks per save slot").

### Acceptance

- Signed-in user sees their save on a fresh browser / different device.
- Conflict on PUT returns 409; UI surfaces a "keep local" / "use server" choice.
- Game remains fully playable signed-out (localStorage-only mode).
- Game remains fully playable gateway-offline (last cloud sync wins; resumes sync when reachable).
- Swapping `AUTH_PROVIDER=dev` works for local development without needing a Supabase project.
- Moving the DB to a non-Supabase host (Neon, Railway, RDS, …) requires only `DATABASE_URL` + auth provider env changes; no code changes.

### Risks

- **Auth-provider lock-in is the failure mode.** Easy to slip in a `supabase-js` data call by accident. Lint rule: ban `@supabase/supabase-js` imports outside `gateway/src/auth/supabase.ts` and `web/src/services/auth.ts`.
- **Save bloat.** `EngineState` grows as the game adds features (NPCs, journal, etc.). Watch the size; if it crosses ~100KB look at splitting hot vs cold state.
- **Migration correctness.** Phase 4a is the prerequisite for everything else; tests required. Property test: for a corpus of older save snapshots, `migrateState(state) ` must produce something that `applyCommand(SET_ACTIVITY)` accepts without `ERROR` events.
- **CORS / token rotation.** Standard, but easy to misconfigure. Verify CORS allowlist matches the deployed web origin.

### Out of scope (deliberately)

- Server-authoritative simulation. Engine still runs client-side.
- Leaderboards, guilds, market, multiplayer. Those are Milestone F2+.
- Event sourcing or time-travel. Snapshots are enough.
- Save export / import UI changes — the existing `exportSave`/`importSave` keep working as a localStorage-only escape hatch.

---

## Sequencing

```
Phase 1 (1–2d)  ──► Phase 2 (2–3d)  ──┐
   offline summary    next-goal widget │
                                       ├──► Phase 3a → 3b → 3c  (NPCs)
Phase 4a (1d) ──► 4b (2d) ──► 4c (3d) ──► 4d (3d) ──► 4e (2d)
   versioning    schema +    auth +      client       narrative
                 read API    write API   sync         store
```

Phases 1, 2, and 4 are independent of each other and can be parallelized. Phase 3 depends on **4a** (save versioning) before it can bump `EngineState.version`, and on Milestone E4 (no-invented-IDs validator) before 3c.

Order I'd actually ship in:

1. **Phase 1** (offline summary) — small, satisfying, no dependencies.
2. **Phase 4a** (versioning) — prerequisite for everything that follows. Closed `known_gaps.md` §2 (entry removed from that doc once shipped).
3. **Phase 2** (next-goal widget) — independent; ships whenever convenient.
4. **Phase 4b–4d** (Postgres + auth + client sync) — multi-device saves working end-to-end.
5. **Phase 3a–3c** (NPCs) — requires versioned saves, benefits from cloud sync (NPCs are per-save state that's annoying to lose).
6. **Phase 4e** (narrative store) — closes Milestone E5; layer on once NPCs exist so it has interesting content to persist.

Don't parallelize 3a/3b/3c or 4b/4c/4d — within each phase the sub-phases share too much state.

---

## What this fixes from `known_gaps.md`

This plan opportunistically closes several of the gaps catalogued in `docs/known_gaps.md`:

- **§1 `getAvailableQuests` reads `Date.now()`** — Phase 3a modifies that function; fix the wall-clock read at the same time.
- ~~**§2 Save/version compatibility**~~ — closed by Phase 4a (`engineVersion` + `contentVersion` + `migrateState` + `FutureSaveError`). Entry removed from `known_gaps.md`.
- **§3 Milestone E partial shipping** (was §4 before §2 was removed) — Phase 3c requires the no-invented-IDs validator (E4) to land first. Phase 4e closes E5 ("Narrative Store").

Promote each to a GitHub issue at the point it gets worked, and remove the entry from `known_gaps.md` when done.
