# RPG Loom

A deterministic, text-first **idle RPG** with an optional **AI narrative layer** (Gemini).

The core game runs fully **without AI**. When enabled, AI adds quest flavor, NPC dialogue, rumors, and journal entries — but **never changes outcomes**.

## 🚧 Current Status: Milestone C (Completed) 🚧

**The Core Loop and UI are fully functional.**
*   **Web Client**: Robust React-based UI with Tabbed Navigation (Activity, Inventory, Character, Quests).
*   **Combat**: Multi-tick deterministic combat (1 round/sec) with real-time **Tactics Switching**.
*   **Progression**: xp/gold tracking, item equipment, and consumable usage.
*   **Persistence**: Auto-save to LocalStorage with manual Import/Export (Base64) for backup.
*   **Debug Tools**: Built-in speed control (Fast Forward) for testing.

## Key ideas

- **Deterministic engine**: rules and outcomes are code-driven and reproducible.
- **Commands → Engine → Events**: the UI sends commands, the engine emits events.
- **AI is optional**: narrative only (JSON output + strict validation). If AI is unavailable, the game still plays normally.
- **Future-ready**: designed for async multiplayer and instanced co-op later (no real-time overworld).

## Monorepo layout

- `web/` — React (Vite) client UI
- `gateway/` — Node API for narrative tasks + SSE streaming + AI backends (Gemini / mock)
- `sdk/` — typed client for the gateway
- `packages/engine/` — deterministic simulation engine
- `packages/content/` — JSON content packs (items, enemies, locations, quests, recipes)
- `packages/shared/` — shared types + zod schemas + utilities
- `docs/` — specs, plan, architecture, tech stack

## Requirements

- Node.js **LTS** (recommended: 20+)
- npm or pnpm

### Optional (for AI narrative)
- Gemini CLI (local backend)
- Gemini API key

## Quick start

```bash
npm install

# terminal A
npm run dev:gateway

# terminal B
npm run dev:web
````

Open the web app (typically): `http://localhost:5173`

## Enable Gemini narrative (optional)

1. Install Gemini CLI:

```bash
npm install -g @google/gemini-cli
```

2. Provide credentials:

```bash
export GEMINI_API_KEY="YOUR_KEY"
```

3. Set the default narrative backend:

```bash
export DEFAULT_NARRATIVE_BACKEND=gemini-cli
# optional model override:
export GEMINI_MODEL=gemini-2.5-pro
```

Then run the gateway:

```bash
npm run dev:gateway
```

If Gemini is not installed or not configured, the gateway will fall back to a mock/no-op narrative backend and the game remains playable.

## Development notes

* The engine must remain deterministic:

  * **No `Math.random()`** in `packages/engine`
  * No wall-clock reads inside engine functions (time is passed as input)
* AI outputs must be:

  * JSON-only
  * validated (schema + length budgets)
  * unable to invent content IDs

## Docs

* `docs/PLAN.md` — milestone plan
* `docs/TECH_STACK.md` — tech stack choices
* `docs/ARCHITECTURE.md` — system architecture and data flow

## License

TBD (choose MIT/Apache-2.0/etc.)

