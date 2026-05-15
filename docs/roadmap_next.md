# Roadmap: Next Three Features

Captured 2026-05-14. This is a **near-term plan layered on `docs/plan.md`**, not a replacement for it. The three features here all fit inside or alongside Milestone E (AI Narrative); they're chosen to make the existing systems feel finished before adding new content.

If this conflicts with `docs/plan.md`, plan.md wins — update this doc or close the gap.

---

## Why these three

A code read on 2026-05-14 (see `docs/known_gaps.md`) flagged that the engine, content, and AI plumbing are largely done, but several systems that would multiply their value haven't shipped:

1. **Offline catch-up summary** — `simulateOffline` already produces the data; nothing surfaces it.
2. **Next-goal widget** — `docs/plan.md` says "there's always an obvious next goal"; the UI doesn't deliver that today.
3. **Recurring NPCs** — `NpcDef` and `npc_dialogue` exist as types but no NPCs are in content and no NPC UI exists. Closing this loop is what makes the AI investment feel structural rather than decorative.

Phase 1 and 2 are pure additive work. Phase 3 forces (and benefits from) finishing Milestone E's ID-validator and the save-versioning fix from `known_gaps.md` §2.

---

## Phase 1 — Offline catch-up summary

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

**Goal:** A roster of ~10 persistent NPCs across the world. They give quests, remember prior interactions, and have AI-flavored personalities cached per save. The game starts feeling like "a guild," not a vending machine.

**Size:** 1–2 weeks, split into three sub-phases.

### 3a — NPC content + engine state (~3 days)

| File | Change |
|---|---|
| `packages/content/data/npcs.json` | New file. Hand-author 10–12 NPCs: `{ id, name, role, locationId, personaCardId, prompts: { greeting, questIntro, ... } }`. Roles already in `types.ts`: `quartermaster, scout_captain, apothecary, scholar, emissary, generic`. |
| `packages/content/data/index.ts` | Load `npcs.json`; add to `ContentIndex.npcsById`. |
| `packages/shared/src/types.ts` | Add `npcsById: Record<NpcId, NpcDef>` to `ContentIndex`. Add `npcState: Record<NpcId, { firstMetAtMs?, lastInteractionMs?, affinity: number, generatedFlavor?: { description, dialogueLines } }>` to `EngineState`. Bump `EngineState.version` to `2` and add a real migration. **This is also the moment to fix the save-versioning gap in `docs/known_gaps.md` §2** — Phase 3 forces the issue. |
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
| `gateway/src/server.ts` | **Prerequisite:** wire up the no-invented-IDs validator from `docs/known_gaps.md` §4 (Milestone E4). NPCs can't reliably reference items/locations until this lands. |
| `web/src/services/adventureQuestGeneration.ts` | Tweak adventure prompts to optionally tie an adventure to a specific NPC ("{NPC name} asks you to..."), pulling from `npcsById`. |

### Acceptance

- 10+ NPCs visible across the world, each in their authored location.
- Talking to an NPC the first time triggers AI flavor generation; subsequent visits show the cached result instantly.
- Quests display "given by {NPC name}" and direct the player back on completion.
- Old saves migrate cleanly to `version: 2` with empty `npcState`.
- Game remains fully playable with the gateway offline (NPCs fall back to authored prompts in `npcs.json`).

### Risks

- First feature that *requires* the Milestone E ID-validator to land first, or AI-generated NPC dialogue will reference non-existent items. Plan to do that work as part of 3c.
- Save versioning needs to actually work this time. Doing the migration here is a forcing function to fix `known_gaps.md` §2 — don't punt it.

---

## Sequencing

```
Phase 1 (1–2d) ──► Phase 2 (2–3d) ──► Phase 3a (3d) ──► Phase 3b (3d) ──► Phase 3c (3d)
   independent     independent       needs save        needs 3a         needs E4 validator
                                     migration                          + Milestone E
```

Phase 2 benefits from Phase 1 being shipped — the offline summary is exactly the kind of thing a player wants right before they look at "what's next."

Phase 3 ships *during* Milestone E rather than after, because it's the feature that justifies finishing the AI validation work. Don't try to parallelize 3a/3b/3c — they share too much state. Don't start Phase 3 until Phases 1 and 2 are merged; the catch-up + goal widgets should be surfacing NPC-related goals once NPCs land.

---

## What this fixes from `known_gaps.md`

This plan opportunistically closes three of the gaps catalogued in `docs/known_gaps.md`:

- **§2 Save/version compatibility** — Phase 3a forces a real version bump + migration.
- **§4 Milestone E partial shipping** — Phase 3c requires the no-invented-IDs validator (E4) to land first.
- **§1 `getAvailableQuests` reads `Date.now()`** — Phase 3a modifies that function; fix the wall-clock read at the same time.

Promote each to a GitHub issue at the point it gets worked, and remove the entry from `known_gaps.md` when done.
