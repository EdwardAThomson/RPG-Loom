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

- AI output is **JSON-only**, validated against zod schemas in `@rpg-loom/shared` (`NarrativeBlockSchema`, `NarrativeTaskSchema`).
- AI **cannot invent IDs** — only items/enemies/locations/quests that exist in the content pack.
- AI **never changes game mechanics or outcomes**, only narrative text.
- Invalid output → gateway returns a safe fallback; UI must degrade gracefully.

Providers are defined in `gateway/src/llm/providers.ts` (`gemini-cli`, `gemini`, `openai`, `claude`, `claude-cli`, `codex`, `mock`). Each has a typed list of allowed `models` and a default. The unified entry point is `generateUnified` in `gateway/src/llm/generator.ts`; CLI-vs-cloud routing comes from `isCLIProvider` / `isCloudProvider`.

Cloud providers expect env vars: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

### Save/version compatibility

Saves include `engineVersion` and `contentVersion` — bump these when changing state shape or content schemas. Engine state is serializable JSON; keep it that way (no `Map`/`Set`/`Date`/class instances in `EngineState`).

## Two UI workspaces — which is which

`web/` is the shipped player client and is what `npm run dev:web` runs. `packages/ui/` is a separate React app skeleton (its own `vite.config.ts`, eslint config, etc.); changes to the actual game UI almost always belong in `web/src/`.
