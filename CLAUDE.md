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

Documented intent (from `docs/architecture.md`, README, `docs/plan.md` Milestone E):

- AI output is JSON-only, validated against zod schemas in `@rpg-loom/shared` (`NarrativeBlockSchema`, `NarrativeTaskSchema`).
- AI cannot invent IDs — only items/enemies/locations/quests that exist in the content pack.
- AI never changes game mechanics or outcomes, only narrative text.
- Invalid output → gateway returns a safe fallback; UI must degrade gracefully.

What's actually enforced today (Milestone E is incomplete):

- The gateway only validates **shape** via `NarrativeBlockSchema` (lines are strings, type is in the enum). It does **not** cross-check that IDs referenced in `lines` exist in the content pack. `finalizeBlock` in `gateway/src/server.ts` substitutes `task.references` verbatim, so AI-supplied refs are dropped — but free text in `lines` is not scanned.
- `web/src/services/adventureQuestGeneration.ts:parseAdventureSpec` does **not** verify that returned `targetEnemyId`/`targetItemId`/`targetLocationId`/`targetRecipeId` exist before handing the spec to the engine as a `GENERATE_ADVENTURE_QUEST` command. If the AI invents an ID, the resulting sub-quest spawns but never progresses (no match in `bumpQuestProgressFromKill/Loot/Craft`).
- The on-error fallback hardcodes `loc_forest` / `enemy_rat` / `loc_haven` — these must remain valid IDs in the content pack or the fallback is also broken.

If you touch the AI pipeline, the missing "no invented IDs" validator is the highest-value place to start.

Providers are defined in `gateway/src/llm/providers.ts` (`gemini-cli`, `gemini`, `openai`, `claude`, `claude-cli`, `codex`, `mock`). Each has a typed list of allowed `models` and a default. The unified entry point is `generateUnified` in `gateway/src/llm/generator.ts`; CLI-vs-cloud routing comes from `isCLIProvider` / `isCloudProvider`.

Cloud env vars: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Note: `gateway/src/server.ts:getApiKeyForProvider` currently reads `CLAUDE_API_KEY` for the `claude` provider, not `ANTHROPIC_API_KEY` as the README states — one of these is wrong.

### Save/version compatibility

Documented rule: saves should include `engineVersion` and `contentVersion` and bump these on shape changes. Engine state is serializable JSON; keep it that way (no `Map`/`Set`/`Date`/class instances in `EngineState`).

In practice: `EngineState` only carries a literal `version: 1`. `web/src/hooks/useGameEngine.ts` base64-encodes the whole state to localStorage on every tick with no versioning or schema validation on load — just a duck-type check on `inventory`/`player` in `importSave`. Lazy migrations live ad-hoc in the engine (`ensureIntrinsicStats`, `ensureQuestAvailability`, `ensureAllSkills` in the hook). Add a proper version stamp + migration step before changing `EngineState` shape.

### Quest system: two parallel paths

Quests come in two flavors that share `QuestInstanceState` but progress through different code:

- **Template quests** — `ACCEPT_QUEST` instantiates from `content.questTemplatesById`. `bumpQuestProgressFromKill/Loot/Craft` matches by `tmpl.objectiveType` + `targetX`. Replenishment is `daily` (cooldown via `questAvailability[templateId].availableAfterMs`) or `chain` (`questAvailability[chainId].chainProgress`).
- **Adventure quests** — `GENERATE_ADVENTURE_QUEST` takes an AI spec and creates a parent quest (`templateId='dynamic_adventure'`) plus sub-quests with synthetic templateIds like `dynamic_kill_<enemyId>`, `dynamic_gather_<itemId>`, `dynamic_craft_<recipeId>`, `dynamic_travel`, `dynamic_explore`, `dynamic_deliver_<itemId>`. Every `bumpQuestProgressFrom*` helper has a `startsWith('dynamic_…_')` branch that splits the target off the templateId. `checkQuestCompletion` recognizes `dynamic_` and routes through `handleAdventureSubQuestCompletion` → `activateNextAdventureStep`. Rewards live on the parent's `adventureRewards`.

When adding a new objective/step type, update **both** `bumpQuestProgressFrom*` (template branch) and `spawnAdventureSubQuest` + the parser in `web/src/services/adventureQuestGeneration.ts` (adventure branch).

## Two UI workspaces — which is which

`web/` is the shipped player client and is what `npm run dev:web` runs. `packages/ui/` is a separate React app skeleton (its own `vite.config.ts`, eslint config, etc.); changes to the actual game UI almost always belong in `web/src/`.

## Docs (and how current they are)

- `docs/plan.md` — active roadmap. Milestones A–D are marked complete; **Milestone E (AI Narrative)** is the current/upcoming work; F–G (online, co-op) are future.
- `docs/milestone_checklist.md` — finer-grained acceptance criteria for the same milestones.
- `docs/roadmap_next.md` — near-term plan layered on `plan.md`: offline-catch-up summary, next-goal widget, recurring NPCs (in that order).
- `docs/known_gaps.md` — catalog of docs-vs-code deltas (engine invariant violations, partially-shipped Milestone E validation, schema drift, etc.). Read this before trusting the system-level docs as ground truth.
- `docs/architecture.md`, `docs/spec.md`, `docs/design.md`, `docs/tech_stack.md` — system-level docs. They describe **intended** invariants; some are aspirational (see "AI rules" and "Save/version compatibility" above, and `docs/known_gaps.md`).
- `docs/dev_log.md` — chronological feature log; last entry 2026-01-14, so trailing reality.
- `docs/PHASE2_TEST_RESULTS.md`, `docs/PHASE3_COMPLETE.md`, `docs/TESTING_PHASE1.md` — historical artifacts of the LLM provider integration, kept for reference.
- `docs/archive/` — superseded notes; don't rely on as current.

When the docs and the code disagree, treat the code as authoritative and update the doc (or open an issue).

## Known gotchas

Sharp edges I'd want to know about before editing:

- **`getAvailableQuests` calls `Date.now()`** (`packages/engine/src/engine.ts:1786`). This violates the no-wall-clock-reads rule the docs emphasize. It should take `nowMs` as an argument like `step`/`simulateOffline`.
- **`packages/shared/src/schemas.ts` is stale** vs `types.ts`. `EngineStateSchema` has `version: z.string()` (type says literal `1`), `flags`/`locationId` at the wrong nesting, and `ActivityTypeSchema` is missing `recovery`/`mine`/`woodcut`/`forage`/`adventure`. The runtime doesn't validate `EngineState` with these schemas, but don't trust them as the contract.
- **`NarrativeTaskTypeSchema` omits `'bestiary_entry'`** even though `types.ts` includes it; the gateway's `CreateTaskReqSchema` enum likewise omits it.
- **`coerceNarrativeBlockFromText` hardcodes `tags: ['gemini', ...]`** regardless of which backend produced the text.
- **Old adventure saves can stall** — `spawnAdventureSubQuest` returns `null` for steps missing a `template` (pre-refactor saves), with only a `console.warn`. The auto-spawn loop in `runOneTick` (~458) keeps retrying every tick.
- **`web/`'s React is 18** while `packages/ui/` is on React 19. Don't copy components blindly between them.
