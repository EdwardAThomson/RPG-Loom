# Known Gaps

This doc catalogs **deltas between the project's documentation and the current code**. It is not a backlog or a roadmap (that's `docs/plan.md`) — it's a triage list, captured from a code read on 2026-05-14. Each entry says: what the doc claims, what the code actually does, and where to look.

When you've decided whether a gap is intentional or a real bug, either fix it, file a GitHub issue and link it here, or update the relevant doc to match the code.

---

## 1) Engine invariant violations

The "engine is pure, deterministic, no IO, no wall-clock" rules are repeated in `docs/architecture.md`, `docs/tech_stack.md`, and the README. Today's code mostly holds the line, with these exceptions:

- **No engine-internal shape validation of `EngineState`.** `migrateState` (Phase 4a) is the single validate-on-load step in spirit, but it only patches missing fields — it doesn't reject malformed shapes (e.g. `quests` arriving as a non-array would still propagate into the engine). A zod-based load-time validator at the `migrateState` boundary would close this. The `ensure*` helpers it calls are now centralized rather than scattered, so the remaining work is type-level only.

## 2) `packages/shared/src/schemas.ts` drifts from `types.ts`

The zod schemas were a milestone A1 deliverable; they've since fallen out of sync with the type definitions. `runtime` doesn't actually use these schemas to validate `EngineState`, so the drift is invisible until someone wires them up — but anyone treating them as the contract will be wrong.

Concrete mismatches:

| Schema | Says | Type says |
|---|---|---|
| `EngineStateSchema.version` | `z.string()` | type has `engineVersion: number` + `contentVersion: string` (no `version` field anymore) |
| `EngineStateSchema` | `locationId` + `flags` at top level | `currentLocationId` at top level, `flags` inside `player` |
| `ActivityPlanSchema` | `{ activityId, type, locationId, params }` | `ActivityPlan { id, params, startedAtMs, durationTicks? }` |
| `ActivityTypeSchema` | `idle, quest, hunt, gather, craft, train, trade, explore` | adds `recovery, mine, woodcut, forage, adventure` |
| `NarrativeTaskTypeSchema` | omits `bestiary_entry` | includes `bestiary_entry` |
| `EquipmentSlotsSchema` | requires `weapon/armor/accessory1/accessory2` as `string \| null` | `EquipmentState` has all four as optional |
| `GameEventSchema` | covers only 4 event types with `data` field | `GameEvent` has 16+ types with `payload` field |

Decide: either delete `schemas.ts`, or treat it as canonical and regenerate types from it.

## 3) Cross-component inconsistencies

Small but real footguns:

- **React 18 vs React 19.** `web/` is on React 18.3 (`web/package.json`); `packages/ui/` is on React 19.2. Don't copy components between them without checking compat.

## 4) Adventure-quest fragility

The `dynamic_*` template-id convention threads through several files; mismatches between them are silent failures.

- **Adding a new step type requires editing two places.**
  1. Engine: `spawnAdventureSubQuest`, the matching `bumpQuestProgressFrom*` `startsWith('dynamic_…_')` branch, and `checkQuestCompletion` / `handleAdventureSubQuestCompletion` routing.
  2. Web: the parser fallback in `adventureQuestGeneration.ts:parseAdventureSpec`, and the prompt template that lists allowed step types.
  
  These two sides are not linked by a shared registry. A new step type that's added to one and not the other will fail silently.

## 5) Doc staleness

- `docs/dev_log.md` — last entry 2026-01-14. Adventure quest generation and quest replenishment are the most recent items; nothing since.
- `docs/PHASE2_TEST_RESULTS.md`, `docs/PHASE3_COMPLETE.md`, `docs/TESTING_PHASE1.md` — artifacts of the LLM-provider integration. Historically useful, but referring to them as current is misleading.
- `docs/architecture.md` and `docs/tech_stack.md` describe **intent**, not the shipped state.

---

## How to use this list

- Triage each section: real bug, deliberate trade-off, or doc bug?
- For real bugs, promote to a GitHub issue and link from the entry.
- For deliberate trade-offs, either edit the originating doc to match reality, or add a short "why" note to this entry.
- When an entry is resolved, remove it (don't keep a "done" log here — that's `dev_log.md`).
