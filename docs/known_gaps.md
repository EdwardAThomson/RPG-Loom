# Known Gaps

This doc catalogs **deltas between the project's documentation and the current code**. It is not a backlog or a roadmap (that's `docs/plan.md`) — it's a triage list, captured from a code read on 2026-05-14. Each entry says: what the doc claims, what the code actually does, and where to look.

When you've decided whether a gap is intentional or a real bug, either fix it, file a GitHub issue and link it here, or update the relevant doc to match the code.

---

## 1) Engine invariant violations

The "engine is pure, deterministic, no IO, no wall-clock" rules are repeated in `docs/architecture.md`, `docs/tech_stack.md`, and the README. Today's code mostly holds the line, with these exceptions:

- **`getAvailableQuests` reads `Date.now()`.** `packages/engine/src/engine.ts:1786` — uses `Date.now()` to check daily-quest cooldowns. It should take `nowMs` as an argument like `step` / `simulateOffline` do. Callers (UI quest board) already have a clock; pass it in.
- **No engine-internal validation of `EngineState`.** `applyCommand` / `step` accept whatever is handed in. The doc says "engine must not throw uncaught — surface failures as `ERROR` events with state intact." That holds for known command paths, but malformed loaded state (e.g. missing `questAvailability`) is patched up by ad-hoc lazy migrations (`ensureQuestAvailability`, `ensureIntrinsicStats`, `ensureAllSkills`) rather than a single validate-on-load step.

## 2) Save/version compatibility is aspirational

Documented (architecture.md §8, plan.md A6): saves include `engineVersion` and `contentVersion`; load is versioned with migrations.

Actual:

- `EngineState.version` is a literal `1` (`packages/shared/src/types.ts:298`). There is no `contentVersion`.
- `web/src/hooks/useGameEngine.ts` base64-encodes the full state to `localStorage` on every tick. On load, `importSave` does a duck-type check on `inventory`/`player` and nothing else.
- Migrations are ad-hoc one-liners scattered through the engine (`ensure*` helpers).

Fix shape: stamp `engineVersion` + `contentVersion` on save, add a `migrate(state)` step before the engine touches a loaded save, and bump versions whenever `EngineState`/content schemas change shape.

## 3) `packages/shared/src/schemas.ts` drifts from `types.ts`

The zod schemas were a milestone A1 deliverable; they've since fallen out of sync with the type definitions. `runtime` doesn't actually use these schemas to validate `EngineState`, so the drift is invisible until someone wires them up — but anyone treating them as the contract will be wrong.

Concrete mismatches:

| Schema | Says | Type says |
|---|---|---|
| `EngineStateSchema.version` | `z.string()` | literal `1` |
| `EngineStateSchema` | `locationId` + `flags` at top level | `currentLocationId` at top level, `flags` inside `player` |
| `ActivityPlanSchema` | `{ activityId, type, locationId, params }` | `ActivityPlan { id, params, startedAtMs, durationTicks? }` |
| `ActivityTypeSchema` | `idle, quest, hunt, gather, craft, train, trade, explore` | adds `recovery, mine, woodcut, forage, adventure` |
| `NarrativeTaskTypeSchema` | omits `bestiary_entry` | includes `bestiary_entry` |
| `EquipmentSlotsSchema` | requires `weapon/armor/accessory1/accessory2` as `string \| null` | `EquipmentState` has all four as optional |
| `GameEventSchema` | covers only 4 event types with `data` field | `GameEvent` has 16+ types with `payload` field |

Decide: either delete `schemas.ts`, or treat it as canonical and regenerate types from it.

## 4) Milestone E (AI Narrative) is partially shipped

`docs/plan.md` Milestone E is the current work. Sub-tasks E1–E6 line up directly with the gaps below — they're not unknown; they're partially-done.

- **E4 ("Output Validator: Schema + ID check + Length budget") — ID check is missing.**
  - **Gateway side:** `gateway/src/server.ts` validates only the *shape* of output (`NarrativeBlockSchema`). `finalizeBlock` substitutes `task.references` verbatim, so AI-supplied `references` are dropped — but free text in `lines` is never scanned for invented IDs.
  - **Adventure spec side:** `web/src/services/adventureQuestGeneration.ts:parseAdventureSpec` does **not** verify `targetEnemyId` / `targetItemId` / `targetLocationId` / `targetRecipeId` against `content.*ById` before issuing the `GENERATE_ADVENTURE_QUEST` command. An AI-invented ID produces a sub-quest that spawns but never progresses (no match in `bumpQuestProgressFromKill/Loot/Craft`). This is the highest-impact gap on this list.
  - **Length budgets:** `NarrativeConstraints` (`maxCharsPerLine`, `maxLines`, etc.) is defined in `types.ts` but never enforced in the gateway. `finalizeBlock` caps `lines.length` to 6 and `tags.length` to 8, and that's it.
- **E5 ("Narrative Store: Persist blocks per save slot") — not implemented.** Narratives live in `QuestInstanceState.aiNarrative` for quest enhancements, but there's no separate store keyed by save slot.
- **Fallback content IDs.** `parseAdventureSpec` falls back to `loc_forest`, `enemy_rat`, `loc_haven` on parse failure. These exist in the content pack today; if any get renamed or removed, the fallback breaks silently. Either pin them as test fixtures or build the fallback from the live content index.

## 5) Cross-component inconsistencies

Small but real footguns:

- **`CLAUDE_API_KEY` vs `ANTHROPIC_API_KEY`.** `gateway/src/server.ts:185` reads `CLAUDE_API_KEY`. README and `@anthropic-ai/sdk` convention is `ANTHROPIC_API_KEY`. Anyone following the README will hit "API key required for Cloud provider: claude" with no obvious cause. Pick one and update the other.
- **`coerceNarrativeBlockFromText` always tags `'gemini'`.** `gateway/src/server.ts:348, 360` hardcodes `tags: ['gemini', ...]` regardless of which backend produced the text. Should use the backend ID from the task record.
- **`bestiary_entry` is half-defined.** Present in `NarrativeTaskType` (`packages/shared/src/types.ts:504`); missing from `NarrativeTaskTypeSchema` (`schemas.ts`) and from `CreateTaskReqSchema` (`gateway/src/server.ts:29`). Either implement it or drop it from the type.
- **React 18 vs React 19.** `web/` is on React 18.3 (`web/package.json`); `packages/ui/` is on React 19.2. Don't copy components between them without checking compat.

## 6) Adventure-quest fragility

The `dynamic_*` template-id convention threads through several files; mismatches between them are silent failures.

- **Pre-refactor saves stall.** `spawnAdventureSubQuest` (`engine.ts:1294`) returns `null` for steps missing a `template` field, with only a `console.warn`. The auto-spawn loop in `runOneTick` (~line 458) retries every tick. There is no `ABANDON_QUEST` triggered or `ERROR` event emitted — the adventure just sits there.
- **Adding a new step type requires editing two places.**
  1. Engine: `spawnAdventureSubQuest`, the matching `bumpQuestProgressFrom*` `startsWith('dynamic_…_')` branch, and `checkQuestCompletion` / `handleAdventureSubQuestCompletion` routing.
  2. Web: the parser fallback in `adventureQuestGeneration.ts:parseAdventureSpec`, and the prompt template that lists allowed step types.
  
  These two sides are not linked by a shared registry. A new step type that's added to one and not the other will fail silently.

## 7) Doc staleness

- `docs/dev_log.md` — last entry 2026-01-14. Adventure quest generation and quest replenishment are the most recent items; nothing since.
- `docs/PHASE2_TEST_RESULTS.md`, `docs/PHASE3_COMPLETE.md`, `docs/TESTING_PHASE1.md` — artifacts of the LLM-provider integration. Historically useful, but referring to them as current is misleading.
- `docs/architecture.md` and `docs/tech_stack.md` describe **intent**, not the shipped state. The "AI rules" and "Save/version compatibility" sections in particular are aspirational (see §2 and §4 above).

---

## How to use this list

- Triage each section: real bug, deliberate trade-off, or doc bug?
- For real bugs, promote to a GitHub issue and link from the entry.
- For deliberate trade-offs, either edit the originating doc to match reality, or add a short "why" note to this entry.
- When an entry is resolved, remove it (don't keep a "done" log here — that's `dev_log.md`).
