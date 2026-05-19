# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

npm-workspaces monorepo (a `pnpm-workspace.yaml` also exists, but `package.json` `workspaces` is authoritative). Requires Node `>=22.12`.

- `packages/engine` (`@rpg-loom/engine`) — deterministic simulation, the only source of gameplay truth.
- `packages/shared` (`@rpg-loom/shared`) — TypeScript types + zod schemas for state, commands, events, narrative DTOs.
- `packages/content` (`@rpg-loom/content`) — JSON data packs (items, enemies, locations, recipes, quest templates) compiled via `tsc`.
- `packages/ui` (`@rpg-loom/ui`) — a separate Vite/React app (note: the playable client is `web/`, not this).
- `web/` (`@rpg-loom/web`) — the actual React/Vite player UI.
- `gateway/` (`@rpg-loom/gateway`) — Express server (port `8787`) that runs LLM tasks and streams results via SSE.
- `sdk/` (`@rpg-loom/sdk`) — typed client for the gateway.

TypeScript path aliases (`tsconfig.base.json`) map `@rpg-loom/*` to `packages/*/src`.

## Common commands

Run from the repo root unless noted.

```bash
# Install
npm install

# Dev — two terminals
npm run dev:gateway      # gateway on http://localhost:8787
npm run dev:web          # web (Vite) on http://localhost:5173

# Cross-workspace
npm run build            # build all workspaces
npm run build:web        # ordered build for shipping the web client (shared → engine+content → ui → web)
npm run typecheck        # tsc --noEmit across workspaces
npm run lint             # eslint where configured (most packages stub this)
npm run test             # vitest across workspaces
```

### Engine tests

`packages/engine` is the only workspace with real tests. Two locations both run under `vitest`:

- `packages/engine/src/tests/*.test.ts` — determinism, combat, economy, invariants, balance.
- `packages/engine/test/*.test.ts` — equipment, mechanics, skills, stats.

```bash
npm -w @rpg-loom/engine run test                     # all engine tests
npm -w @rpg-loom/engine exec vitest run src/tests/determinism.test.ts   # one file
npm -w @rpg-loom/engine exec vitest -t "name"        # by test name
```

### Gateway URL override

Web → gateway URL comes from `VITE_GATEWAY_URL` (defaults to `http://localhost:8787`). Gateway listens on `PORT` (default `8787`).

### Deployed build env vars

`VITE_SITE_URL` and `VITE_BASE_PATH` configure metadata/subpath for `npm run build:web`.

## Architecture (the rules that constrain edits)

### Commands → Engine → Events

UI never mutates engine state. The only flow is:

1. UI builds a `CommandEnvelope` and calls `applyCommand(state, cmd, content)` (or `step`/`simulateOffline`) from `@rpg-loom/engine`.
2. Engine returns `{ state, events }`. `GameEvent[]` is the sole "fact stream".
3. UI renders state + events. If AI is enabled, recent events become a `FactsBundle` → gateway `NarrativeTask` → `NarrativeBlock` (text only, dropped on validation failure).

Primary engine entry points live in `packages/engine/src/engine.ts`: `createNewState`, `applyCommand`, `step`, `simulateOffline`, plus helpers like `recalculateStats`, `gainSkillXp`, `getAvailableQuests`. Re-exported via `packages/engine/src/index.ts`.

### Hard engine invariants

Don't break these — they're the reason the engine is testable and serializable:

- **No `Math.random()`** in `packages/engine`. Use the seeded RNG in `packages/engine/src/rng.ts` (`hashFloat`, `hashInt`).
- **No wall-clock reads** (`Date.now()`, `performance.now()`) inside engine functions. Time is always passed in as `nowMs` / `fromMs` / `toMs`.
- **No IO / network / DOM** in engine. Pure functions only; state mutations stay inside the returned `state`.
- `applyCommand` must be **idempotent** per `commandId`.
- Engine must not throw uncaught — surface failures as `ERROR` events with state intact.

### AI rules

The game must remain fully playable with the gateway offline. AI code lives in `gateway/src/llm/` and `web/src/services/{adventureQuestGeneration,questEnhancement,aiSettings,gateway}.ts`.

Rules:

- AI output is JSON-only, validated against zod schemas in `@rpg-loom/shared` (`NarrativeBlockSchema`, `NarrativeTaskSchema`).
- AI cannot invent IDs — only items/enemies/locations/quests that exist in the content pack.
- AI never changes game mechanics or outcomes, only narrative text.
- Invalid output → gateway returns a safe fallback; UI degrades gracefully.

Enforcement (Milestone E shipped):

- **Structured IDs**: `web/src/services/adventureQuestGeneration.ts:parseAdventureSpec` rejects specs whose step-template IDs aren't in the content pack.
- **Free-text IDs**: `gateway/src/narrative/finalize.ts:sanitizeNarrativeText` scans `(item|enemy|loc|npc|recipe)_<rest>` tokens in lines + title; valid IDs are substituted with the entity's human name (`item_wood` → "Wood"), invented ones with a generic placeholder ("a creature", "the area"). Runs in `finalizeBlock` before the length budget.
- **Length budgets**: `finalizeBlock` caps title (80 chars), lines (240/line × 6 lines × 1200 total), tags (8 max).
- **Refs**: AI-supplied `references` are dropped; the task's `references` are substituted verbatim.

Providers are defined in `gateway/src/llm/providers.ts` (`gemini-cli`, `gemini`, `openai`, `claude`, `claude-cli`, `codex`, `mock`). Each has a typed list of allowed `models` and a default. The unified entry point is `generateUnified` in `gateway/src/llm/generator.ts`; CLI-vs-cloud routing comes from `isCLIProvider` / `isCloudProvider`.

Cloud env vars: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Gateway accepts `CLAUDE_API_KEY` as a legacy fallback for the `claude` provider but prefers `ANTHROPIC_API_KEY`.

### Save/version compatibility

`EngineState` carries `engineVersion: number` (current: `3`) and `contentVersion: string` (current: `'2026-05-19'`). Engine state must remain serializable JSON — no `Map`/`Set`/`Date`/class instances.

`migrateState(raw, currentContentVersion)` in `packages/engine/src/engine.ts` is the single load-time entry point. It:
- Throws `FutureSaveError` if `incoming > CURRENT_ENGINE_VERSION` (don't silently truncate saves from the future).
- Runs ordered per-version migrations behind `if (incoming < N)` guards (v1→v2 backfills `npcState`; v2→v3 parks any in-flight 5/5 quest with a giver at `'ready_to_turn_in'`).
- Restamps `engineVersion` + `contentVersion` and calls the centralized `ensure*` helpers (`ensureAllSkills`, `ensureIntrinsicStats`, `ensureQuestAvailability`, `ensureNpcState`).

Both `useGameEngine`'s localStorage load and the cloud-save restore path go through `migrateState`. When bumping `EngineState` shape, add a new `if (incoming < N+1)` block and bump `CURRENT_ENGINE_VERSION`.

### Quest system: two parallel paths

Quests come in two flavors that share `QuestInstanceState` but progress through different code:

- **Template quests** — `ACCEPT_QUEST` instantiates from `content.questTemplatesById`. `bumpQuestProgressFromKill/Loot/Craft` matches by `tmpl.objectiveType` + `targetX`. Replenishment is `daily` (cooldown via `questAvailability[templateId].availableAfterMs`) or `chain` (`questAvailability[chainId].chainProgress`).
- **Adventure quests** — `GENERATE_ADVENTURE_QUEST` takes an AI spec and creates a parent quest (`templateId='dynamic_adventure'`) plus sub-quests with synthetic templateIds like `dynamic_kill_<enemyId>`, `dynamic_gather_<itemId>`, `dynamic_craft_<recipeId>`, `dynamic_travel`, `dynamic_explore`, `dynamic_deliver_<itemId>`. Every `bumpQuestProgressFrom*` helper has a `startsWith('dynamic_…_')` branch that splits the target off the templateId. `checkQuestCompletion` recognizes `dynamic_` and routes through `handleAdventureSubQuestCompletion` → `activateNextAdventureStep`. Rewards live on the parent's `adventureRewards`.

When adding a new objective/step type, update **both** `bumpQuestProgressFrom*` (template branch) and `spawnAdventureSubQuest` + the parser in `web/src/services/adventureQuestGeneration.ts` (adventure branch).

## Two UI workspaces — which is which

`web/` is the shipped player client and is what `npm run dev:web` runs. `packages/ui/` is a separate React app skeleton (its own `vite.config.ts`, eslint config, etc.); changes to the actual game UI almost always belong in `web/src/`.

## Docs (and how current they are)

- `docs/plan.md` — milestone roadmap. Milestones A–E are complete; F (async online) and G (instanced co-op) are future scope.
- `docs/milestone_checklist.md` — finer-grained acceptance criteria for the same milestones.
- `docs/roadmap_next.md` — near-term plan layered on `plan.md`. All phases (offline summary, next-goal widget, recurring NPCs, Postgres-backed cloud saves) have shipped.
- `docs/known_gaps.md` — catalog of remaining docs-vs-code deltas. Short list now (schemas.ts drift, React 18 vs 19, adventure step type registry).
- `docs/architecture.md`, `docs/spec.md`, `docs/design.md`, `docs/tech_stack.md` — system-level docs. They describe **intended** invariants; many are now actually shipped (see "AI rules" and "Save/version compatibility" above).
- `docs/dev_log.md` — chronological feature log; current through 2026-05-19.
- `docs/PHASE2_TEST_RESULTS.md`, `docs/PHASE3_COMPLETE.md`, `docs/TESTING_PHASE1.md` — historical artifacts of the LLM provider integration, kept for reference.
- `docs/archive/` — superseded notes; don't rely on as current.

When the docs and the code disagree, treat the code as authoritative and update the doc (or open an issue).

## Known gotchas

Sharp edges I'd want to know about before editing:

- **`player.xp` is a derived field**, not a write target. `syncDerivedPlayerStats` rebuilds it from the sum of skill XPs every tick. Any direct `state.player.xp += N` or `gainXp(state, N)` call is silently overwritten on the next tick. Quest XP rewards route through `gainSkillXp` via `inferSkillsForQuestXp` instead; other `gainXp` callers (`+1`/tick during gather/combat) don't actually stick to `player.xp` either. If you need a real "total XP" gain, write it into a skill.
- **`packages/shared/src/schemas.ts` is stale** vs `types.ts` (seven mismatches catalogued in `known_gaps.md` §2). The runtime doesn't validate `EngineState` with these schemas, but don't trust them as the contract.
- **Adding a new adventure step type touches four places**: engine's `spawnAdventureSubQuest`, the matching `bumpQuestProgressFrom*` `startsWith('dynamic_…_')` branch, `handleAdventureSubQuestCompletion` routing, and the web parser's fallback in `adventureQuestGeneration.ts`. There's no shared registry — a partial addition fails silently.
- **`web/`'s React is 18** while `packages/ui/` is on React 19. Don't copy components blindly between them.
