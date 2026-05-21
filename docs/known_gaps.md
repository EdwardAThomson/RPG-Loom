# Known Gaps

This doc catalogs **deltas between the project's documentation and the current code**. It is not a backlog or a roadmap (that's `docs/plan.md`) — it's a triage list. Originally captured from a code read on 2026-05-14; periodically pruned as gaps are closed.

When you've decided whether a gap is intentional or a real bug, either fix it, file a GitHub issue and link it here, or update the relevant doc to match the code.

---

## 1) Cross-component inconsistencies

Small but real footguns:

- **React 18 vs React 19.** `web/` is on React 18.3 (`web/package.json`); `packages/ui/` is on React 19.2. Don't copy components between them without checking compat.

## 2) Doc staleness

- `docs/PHASE2_TEST_RESULTS.md`, `docs/PHASE3_COMPLETE.md`, `docs/TESTING_PHASE1.md` — artifacts of the LLM-provider integration. Historically useful, but referring to them as current is misleading.
- `docs/architecture.md` and `docs/tech_stack.md` describe **intent**, not the shipped state. Most of what they describe is now actually true (Milestone E enforcement, save versioning, etc.) — a refresh pass would close the gap between "what the docs say we plan to do" and "what we did."

---

## How to use this list

- Triage each section: real bug, deliberate trade-off, or doc bug?
- For real bugs, promote to a GitHub issue and link from the entry.
- For deliberate trade-offs, either edit the originating doc to match reality, or add a short "why" note to this entry.
- When an entry is resolved, remove it (don't keep a "done" log here — that's `dev_log.md`).
