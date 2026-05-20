# Known Gaps

This doc catalogs **deltas between the project's documentation and the current code**. It is not a backlog or a roadmap (that's `docs/plan.md`) — it's a triage list. Originally captured from a code read on 2026-05-14; periodically pruned as gaps are closed.

When you've decided whether a gap is intentional or a real bug, either fix it, file a GitHub issue and link it here, or update the relevant doc to match the code.

---

## 1) Engine state shape validation

The "engine is pure, deterministic, no IO, no wall-clock" rules are repeated in `docs/architecture.md`, `docs/tech_stack.md`, and the README. Today's code mostly holds the line. The one remaining gap is **load-time shape validation**:

- `migrateState` is the single validate-on-load step in spirit, but it only patches missing fields — it doesn't reject malformed shapes (e.g. `quests` arriving as a non-array would still propagate into the engine). A zod-based load-time validator at the `migrateState` boundary would close this. The `ensure*` helpers it calls are centralized, so the remaining work is type-level only.

## 2) Cross-component inconsistencies

Small but real footguns:

- **React 18 vs React 19.** `web/` is on React 18.3 (`web/package.json`); `packages/ui/` is on React 19.2. Don't copy components between them without checking compat.

## 3) Adventure-quest fragility

The `dynamic_*` template-id convention threads through several files; mismatches between them are silent failures.

- **Adding a new step type requires editing four places** with no shared registry tying them together:
  1. `spawnAdventureSubQuest` (engine)
  2. The matching `bumpQuestProgressFrom*` `startsWith('dynamic_…_')` branch (engine)
  3. `checkQuestCompletion` / `handleAdventureSubQuestCompletion` routing (engine)
  4. The parser fallback in `web/src/services/adventureQuestGeneration.ts:parseAdventureSpec` + the prompt template that lists allowed step types (web)

  A partial addition fails silently — the step generates but never progresses.

## 4) Doc staleness

- `docs/PHASE2_TEST_RESULTS.md`, `docs/PHASE3_COMPLETE.md`, `docs/TESTING_PHASE1.md` — artifacts of the LLM-provider integration. Historically useful, but referring to them as current is misleading.
- `docs/architecture.md` and `docs/tech_stack.md` describe **intent**, not the shipped state. Most of what they describe is now actually true (Milestone E enforcement, save versioning, etc.) — a refresh pass would close the gap between "what the docs say we plan to do" and "what we did."

---

## How to use this list

- Triage each section: real bug, deliberate trade-off, or doc bug?
- For real bugs, promote to a GitHub issue and link from the entry.
- For deliberate trade-offs, either edit the originating doc to match reality, or add a short "why" note to this entry.
- When an entry is resolved, remove it (don't keep a "done" log here — that's `dev_log.md`).
