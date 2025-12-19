# Tech Stack

Project: **RPG-Loom Chronicles**
Repo style: **Monorepo**
Core philosophy: **Deterministic engine first; AI narrative is optional**

---

## Stack overview

### Languages
- **TypeScript** across the entire codebase (engine, web, gateway, SDK)
- **Node.js (LTS)** for all server-side and tooling

### Monorepo and build tooling
- **pnpm workspaces** (fast installs, great monorepo ergonomics)
- Optional: **Turborepo** for task orchestration (build/test/lint across packages)

### Runtime validation and schemas
- **zod** for validating:
  - content JSON packs (items/enemies/locations/quests)
  - command envelopes (future online readiness)
  - narrative outputs (JSON-only, no invented IDs)

### Testing
- **Vitest** for unit tests (engine/shared/tooling)
- Determinism tests (“golden snapshots”) for the engine as first-class tests

---

## Deterministic game engine

### Engine
 - **Pure TypeScript module** in `packages/engine`
 - Strict rule: **no `Math.random()`** in engine. All randomness via seeded RNG utilities.
 - **Purity & Isolation**:
   - `applyCommand(state, commandEnvelope)`: must be **idempotent**.
   - `step(state, nowMs)`: time is explicit input.
   - `simulateOffline(state, fromMs, toMs)`: chunked offline catch up.
 - **Strict outputs**: Returns only `GameEvent[]` (facts) + new state. No side effects.

### Content
- Data-driven content in `packages/content/data/*.json`
- Validated at build/test time with zod (fail fast if IDs are missing or referenced incorrectly)

### Headless simulation tooling
- Node scripts (e.g., `packages/engine-tools/`) to run:
  - balance sweeps
  - “simulate 10k ticks” invariant checks
  - report exports (xp/hr, gold/hr, encounter rates)

---

## Web client

### UI framework
- **React + Vite + TypeScript**
- **Tailwind CSS** for rapid iteration and clean UI layout

### Component primitives
- Optional but recommended: **shadcn/ui** (Tabs, Cards, Buttons, Dialogs)
  - Keeps UI consistent without committing to a heavy design system

### Persistence
- Start with **localStorage** for quick iteration
- Upgrade to **IndexedDB** using `idb` for:
  - large saves
  - narrative journals/log history
  - future: cached content packs

### Streaming updates
- UI consumes narrative generation via **SSE** from the gateway
- UI never mutates engine state directly — only sends commands to engine module

---

## Gateway (task runner + optional AI narrative)

### Server framework
- **NestJS** (recommended default)
  - Good structure for “MVP now, online later”
  - Plays nicely with task routing, modules, validation, and future auth

(If you want a lighter MVP, Fastify is viable, but NestJS is the default choice here.)

### Streaming transport
- **SSE (Server-Sent Events)** for narrative token/line streaming:
  - simple to implement
  - great UX for “typing” logs
  - stable through proxies compared to websockets for this use case

### Task execution model
- Tasks created by type:
  - `npc_dialogue`, `quest_flavor`, `rumor_feed`, `journal_entry`, `bestiary_entry`
- MVP storage:
  - in-memory task registry
- Later (if hosted):
  - **Redis** for queues + task state (optional upgrade)

### Security posture (important)
- Default assumption: gateway runs **locally** when using CLI backends
- If hosted:
  - disable raw shell execution
  - strict whitelists
  - timeouts + cancellation
  - sandbox/containerization

---

## AI integration (optional “nice to have”)

### Default backend for narrative
- **Gemini CLI** as a backend option (local)
- Narrative system must have:
  - JSON-only outputs
  - strict zod schema validation
  - “no invented IDs” validation against content pack
  - hard length budgets
  - fallback mode when AI is unavailable

### Backend abstraction
Backends implement a common interface:
- `runTask(task: NarrativeTask): AsyncIterable<NarrativeDelta> | Promise<NarrativeBlock>`

This allows later additions:
- Gemini API direct
- Claude / OpenAI backends
- local models

---

## Future online features (async multiplayer + co-op instances)

Not in MVP, but the stack stays compatible.

### Server-authoritative mode (Phase 1+)
- **NestJS API** expands to handle:
  - accounts
  - cloud save snapshots
  - leaderboards
  - guilds/world events

### Data and infra
- **PostgreSQL** for persistent data (accounts/guilds/markets/leaderboards)
- **Redis** for:
  - rate limiting
  - queues
  - coordinating co-op dungeon instances
- ORM choice (future):
  - **Prisma** (recommended for speed + migrations + typed queries)

### Co-op instanced dungeons
- Still tick/turn-based
- Server simulates instances deterministically from:
  - roster
  - seed
  - submitted “plans” (loadout + tactics + thresholds)

---

## Repo structure

Recommended layout:

- `web/` — React UI (Vite)
- `gateway/` — NestJS API (tasks + SSE + backends)
- `sdk/` — typed client for gateway
- `packages/engine/` — deterministic simulation engine
- `packages/content/` — JSON content packs + schemas
- `packages/shared/` — shared types, zod schemas, utilities
- `docs/` — specs, plan, tech stack

---

## Version targets (suggested defaults)

- Node.js: **20 LTS** (or newer LTS)
- TypeScript: current stable
- React: current stable
- Tailwind: current stable

(Exact versions can be pinned in `package.json` once the repo is initialized.)

---

## Why this stack

- TS end-to-end keeps the engine, UI, and gateway consistent and shareable.
- Deterministic engine + command/event model makes future async multiplayer straightforward.
- SSE is the simplest “streaming” transport for narrative.
- AI is safely isolated: it can enrich text, but can’t alter outcomes.
