# Developer Log

## 2026-05-19

### AI Gateway Fixes (Closed)

*   **Prompt leak into UI on AI failure**: `generateWithCLI` had been baking the full CLI args (including the prompt body as the value of `-p`) into thrown error strings, which `/api/llm/generate` echoed back to the client. A failed adventure-quest generation rendered the entire authoring prompt in the player UI. Split logging from throwing: full detail (command + args + stderr) now goes to `console.error` server-side; the thrown `Error` carries only `AI provider X failed (exit code N)` plus a length-capped stderr summary.
*   **`claude` CLI flag mismatch**: `ClaudeAdapter` requested `-p <prompt> --output-format stream-json`, which the CLI rejects with `Error: When using --print, --output-format=stream-json requires --verbose`. Added `--verbose`; the existing event-stream parser already discards non-`assistant` events so the extra log lines are harmless.
*   **`CLAUDE_API_KEY` vs `ANTHROPIC_API_KEY`**: `getApiKeyForProvider` read `CLAUDE_API_KEY` while the README and `@anthropic-ai/sdk` convention is `ANTHROPIC_API_KEY`. Prefer the canonical name; keep `CLAUDE_API_KEY` as a fallback for back-compat.

### Narrative Block Cleanup (Closed)

*   **Backend attribution in tags**: `finalizeBlock` and `coerceNarrativeBlockFromText` hardcoded `tags: ['gemini', ...]` regardless of which backend produced the block. Use `task.backendId` (with `'unknown'` fallback) so tags actually reflect the source.
*   **`bestiary_entry` finished**: was in `NarrativeTaskType` but missing from `NarrativeTaskTypeSchema` and from `CreateTaskReqSchema` — clients hit a 400 trying to create one. Added to the shared schema; pointed `CreateTaskReqSchema` at the shared enum so future additions are a one-place change; gave `mockGenerate` placeholder lines.
*   **E4 free-text ID scanner**: `parseAdventureSpec` already validated structured IDs and `finalizeBlock` enforced length budgets, but free text in `lines` could still contain invented IDs like `enemy_dragon`. New `sanitizeNarrativeText(text, content)` scans `(item|enemy|loc|npc|recipe)_<rest>` tokens: valid IDs are substituted with the entity's human name (UX win — `item_wood` reads as "Wood"); invented IDs are substituted with a generic placeholder ("a creature", "the area"). Threaded through `finalizeBlock` and `server.ts` (JSON, extracted JSON, prose fallback, mock paths). Closes `known_gaps.md` §3.

### Engine Resilience (Closed)

*   **Offline catch-up on visibility regain and wake**: the cold-start path simulated offline progress correctly, but two cases never reached it. (1) Background-throttled tabs got `~1 tick/min` from the browser, so `lastTickAtMs` crept forward and the gap never crossed the 60s threshold. (2) Laptop sleep with the tab open: on wake, the interval fired `step()` once with an 8-hour gap, which grinds ~28k ticks synchronously on the main thread and surfaces no summary modal. Factored the catchup into `tryOfflineCatchup()` and called it from three signals: initial mount, `visibilitychange → visible`, and the top of every interval tick as defense in depth (routes through `simulateOffline`, capped at `MAX_OFFLINE_MS`).
*   **Adventure auto-spawn kill switch**: `runOneTick` retried `spawnAdventureSubQuest` every tick when a step's `template` field was missing (an old save shape), spamming `console.warn` forever. Added a status gate (`adventureQuest.status === 'active'`) so the loop is inert once the adventure is failed/abandoned/completed, and on null spawn marked the adventure as `failed`, idled the activity, and emitted `ERROR + ACTIVITY_SET` so the player can recover.

## 2026-05-18

### Quest Turn-In Flow (Completed)

*   **New `ready_to_turn_in` status**: template quests with an `npcId` no longer auto-complete at progress complete; they park at the new status until the player travels to the giver and issues `TURN_IN_QUEST`. Rewards (xp/gold/items/reputation), affinity bump, and daily/chain replenishment all credit at turn-in.
*   **Auto-complete preserved for ID-less quests**: adventure sub-quests (`dynamic_*`) and templates lacking `questGiverNpcId` keep the old auto-complete path — there's nobody to walk back to.
*   **Engine version bumped to v3** with a v2→v3 migration that parks any in-flight 5/5 active quest with a giver at the new status, so mid-game saves stay coherent.
*   **Quest XP routes to relevant skills**: `player.xp` is a derived field (rebuilt from skill XPs every tick by `syncDerivedPlayerStats`), so the existing `gainXp(state, rewards.xp)` was a write that got overwritten. New `inferSkillsForQuestXp(tmpl, content)` maps each objective type to the skill(s) that should receive the XP — gather → matching gathering skill (woodcutting/mining/foraging based on which table the target item lives in); kill → split across the 4 combat skills; craft → recipe's authored skill.
*   **UI**: NpcDialogueModal grew a "Ready to hand in" section with a Hand-In button; QuestView active cards show "(Ready to hand in)" + "Hand in to {NPC}" disabled until the player is co-located.

### Arcana + Marksmanship Unlock (Completed)

The engine had dispatched offensive skill by weapon tag since combat first shipped (`bow` → marksmanship, `wand`/`staff` → arcana, else → swordsmanship), but two of the three combat paths were unreachable:

*   **No weapons carried `tags`**: tagged `item_crystal_wand` with `["wand"]` so the existing wand actually routes to arcana.
*   **No bow items existed**: added 5 bow tiers (hunting → short → iron-reinforced → yew longbow → storm bow) with parallel atk + crit + spd modifiers to the sword tier.
*   **Arcana had no stat curve**: added `+0.5 ATK per level` (mirrors swordsmanship). Added 5 staff tiers (apprentice → carved → iron-tipped → runed → archmage's) to give arcana real progression.
*   **10 new woodworking recipes** at levels 1/5/10/15/25 so the player can craft each bow + staff tier with sensible materials.
*   **UI hint**: Combat widget now shows `Weapon skill: Swordsmanship/Marksmanship/Arcana` derived from the equipped weapon's tag.

### Quest Location Signposts + Pacing (Completed)

*   **Quest activity location now surfaced in three places** so players know where to go after accepting: NPC modal offered quests (`Gather 1-3 Wood · in Whispering Forest`), NPC modal "Their errand" section (`in progress · 3/5 · in Whispering Forest`), and Quest tab active cards (under the objective line).
*   **Fix: NPC quest offers when activity is elsewhere**: the dialogue modal had piped offered quests through `getAvailableQuests` which filters by the player's current location. Aldric at Haven's Cross couldn't offer his "Gather wood in the Forest" quest — the player isn't at the Forest. New `getQuestsOfferedByNpc(state, content, npcId, nowMs)` applies the same active/replenishment/one-time gates without the player-location check.
*   **Gather pacing slowed**: drop max-qtys reduced across all 11 locations (e.g. forest wood 2-5 → 1-3) and gather quest targets bumped ~50% (intro/daily/chain). The intro "Winter Supplies" used to finish in 1-2 ticks; now ~4-8.

### Combat UI Stability (Completed)

The Combat widget + Combat Stance section were tied to `state.activeEncounter`, so they vanished between fights and the surrounding UI jumped. Render both whenever the activity is `hunt`; show a "Scanning for foes…" placeholder between encounters with the same row count so the container holds its height.

## 2026-05-17

### Recurring NPCs — Phase 3b + 3c (Completed)

*   **Phase 3b: NPC interaction UI** — new NPCs tab listing NPCs at the current location (name, role, last interaction, affinity, available quests); `NpcDialogueModal` for a single NPC conversation with cached AI flavor, affinity bar, and a Greet/Talk-again button.
*   **Phase 3c: AI dialogue pipeline** — first-time interaction fires off a `NarrativeTask { type: 'npc_dialogue' }` to the gateway and caches the result in `npcState[npcId].generatedFlavor`. Subsequent visits show the cached output instantly. Fire-and-forget on the first Greet (no visible "generate" button — the NPCs feel like they've always existed). Gateway-offline path falls back to the authored prompts in `npcs.json`.
*   **NPC polish**: dropped the "???" reveal placeholder, enforced NPC location server-side, added an Activity-tab chat affordance.

### Build Plumbing

*   `Vite @rpg-loom/content` aliased to source (`data/index.ts`) like `engine` and `shared`, so content edits hot-reload without a `tsc` rebuild step.

## 2026-05-16

### Recurring NPCs — Phase 3a (Completed)

*   **NPC content + engine state foundation**: hand-authored `npcs.json` with ~12 NPCs across 5 locations (Aldric, Tovan, Marrick, Mira, Brokk, Vesna, Vidar, Kael, etc.); `npcsById` added to `ContentIndex`; `npcState: Record<NpcId, { firstMetAtMs, lastInteractionMs, affinity, generatedFlavor? }>` added to `EngineState`; new commands `TALK_TO_NPC` (+1 affinity, capped at 100) and `SET_NPC_FLAVOR`; bumped `CURRENT_ENGINE_VERSION` to `2` with a v1→v2 migration that backfills `npcState = {}`.
*   **`getAvailableQuests` accepts `nowMs`**: the wall-clock read flagged in `known_gaps.md` §1 fixed at the same time the function was touched for NPC-affinity gating.

### Milestone E4 (Phase 1): Structured ID Validator (Completed)

*   `parseAdventureSpec` now validates every step-template ID against the content pack at parse time. Invalid IDs reject the spec instead of producing a sub-quest that never progresses.
*   `finalizeBlock` enforces length budgets on title (80 chars), lines (240 per line, 6 lines max, 1200 total), and tags (8 max).
*   Free-text ID scanning was deferred to a follow-up (eventually closed on 2026-05-19).

### Cloud Saves — Phases 4b/4c/4d/4e (Completed)

*   **4b: Postgres schema + read-only API** — `users`, `saves`, `narrative_blocks` tables; `gateway/src/persistence/` for `pg` access; `GET /api/saves` and `GET /api/saves/:slot` behind a hardcoded dev user.
*   **4c: Auth abstraction + write API** — `AuthProvider` interface with `SupabaseAuthProvider` (JWT-verify via `jose`, no `supabase-js` data dependency) and `DevAuthProvider` (any token → fixed test user); `requireAuth` middleware; `PUT /api/saves/:slot` with `If-Match`-style generation conflict check returning 409.
*   **4d: Client-side cloud sync** — `web/src/services/auth.ts` and `cloudSave.ts`; `useGameEngine` tries cloud on mount and falls back to localStorage; periodic push every 30s; `SettingsModal` got sign-in/out, "Sync now" button, conflict-resolution prompt (Keep Local / Use Server).
*   **4e: Narrative store** — `gateway/src/persistence/narrative.ts`; successful `NarrativeTask` blocks are persisted per save slot; `GET /api/saves/:slot/narrative`; new `JournalView` renders accumulated history. Closes Milestone E5.

## 2026-05-15

### Phase 1: Offline Catch-Up Summary (Completed)

*   `simulateOffline(state, fromMs, toMs, content)` already existed; this surfaced it. New `summarizeEvents(events, opts)` rolls the event stream into `OfflineSummary { durationMs, kills, loot, xpGained, goldDelta, questsCompleted, levelUps, cappedAtMs? }`.
*   On mount, if `Date.now() - state.lastTickAtMs > 60s`, simulate offline (capped at `MAX_OFFLINE_MS = 24h`) and surface the summary in a new `OfflineSummaryModal`.
*   **Followup fix**: capped offline-event spillover into the live event log at the last 15 entries — 86k events from a 24h catchup was freezing the modal click handler.

### Phase 4a: Save Versioning + Migration (Completed)

*   `EngineState.engineVersion: number` + `contentVersion: string` (replaced the literal `version: 1`); `CONTENT_VERSION` exported from `@rpg-loom/content`.
*   `migrateState(raw, currentContentVersion)` is now the single load-time entry point. Throws `FutureSaveError` when `engineVersion > current`; otherwise folds the ad-hoc `ensureIntrinsicStats`/`ensureQuestAvailability`/`ensureAllSkills` helpers into one ordered migration. Per-version migration steps live behind `if (incoming < N)` guards.
*   Used by both `useGameEngine`'s localStorage load and (later) the cloud restore path.

### Phase 2: Next-Goal Widget (Completed)

*   New `getNextGoals(state, content, limit = 3): Goal[]` in the engine. Scans active quests, nearby recipes (within 5 skill levels of `requiredSkillLevel`), and nearby locations (within 5 levels/stats of `requirements`). Ranks by "fraction-complete," with active quests boosted into `[0.5, 1.0]` so a freshly-accepted quest doesn't get buried under nearly-unlocked recipes.
*   `NextGoalsPanel` renders the top N goals as progress bars; each goal carries an `actionHint` so clicking jumps to Crafting / Travel / Quests.
*   **Followup**: dedupe goals when multiple recipes share a skill milestone — e.g. "Unlock Obsidian Armor" + "Unlock Obsidian Shield" (both at blacksmithing 30) collapse into "Reach blacksmithing 30 (unlocks 2 recipes)".

### Roadmap Reconciliation

*   New `docs/roadmap_next.md` captures the near-term plan layered on `plan.md`: Phase 1 (offline catch-up), Phase 2 (next-goal widget), Phase 3 (recurring NPCs), Phase 4 (Postgres-backed cloud saves, pulled forward from Milestone F1).
*   `plan.md` / `milestone_checklist.md` reconciled to match.

## 2026-05-14

### Project Documentation Foundation

*   `CLAUDE.md` at repo root — monorepo layout, common commands, engine + AI invariants, the two parallel quest paths (template vs. adventure), known gotchas. Single source of truth for "what is this repo and what rules constrain edits."
*   `docs/known_gaps.md` catalogs deltas between the project's documentation and the current code — not a backlog, a triage list. Captured the engine invariant violations, the `schemas.ts` drift from `types.ts`, Milestone E partial shipping, several cross-component inconsistencies, and the adventure-quest fragility.

## 2026-03-17 to 2026-03-18

### Hosting + Build Hygiene

*   Bumped `engines.node` to `>=22.12` and Node 22 baselines.
*   `tsconfig` excludes tests from the build output.
*   Updated OG image, favicon, deployment metadata for the upcoming Cloudflare host.
*   Gateway cleanup ahead of multi-LLM provider work.
*   Debug menu hidden by default (still in source, commented out).

## 2026-01-15 to 2026-01-29

### Adventure Quests — Sub-Quest Refactor (Completed)

*   Refactored the adventure system to use real sub-quests with dynamic step progression instead of inline step state. Each adventure step now spawns a sub-quest with a synthetic `dynamic_<type>_<target>` template-id that the existing `bumpQuestProgressFrom*` helpers progress against.
*   Delayed sub-quest spawning to the tick the parent step becomes active, so a future step doesn't appear in the player's quest list prematurely.
*   Skill migration for older saves so the new sub-quest progression doesn't trip on missing fields.

### Activity Independence + Inventory Refinement

*   Quest activity no longer locks the player's general activity — they can switch freely while keeping the active sub-quest in progress.
*   Inventory stack merging tightened (consolidation pass via `syncDerivedPlayerStats`).

### Adventure Quest Generation — Blog Post

*   `docs/blog_adventure_quest_generation.md` writeup of the hybrid AI-powered adventure generation system (parser, fallback, content-aware prompting).

## 2026-01-14

### Quest Replenishment System (Completed)

*   **Quest Availability Tracking**:
    *   Added `questAvailability` field to `EngineState` for tracking daily quests and quest chains.
    *   Implemented backward-compatible migration (`ensureQuestAvailability()`) for existing saves.
    *   **Daily Quests**: 24-hour cooldown system with configurable duration.
    *   **Quest Chains**: Sequential unlocking based on completion of previous steps.
*   **Quest Chain Implementation**:
    *   Fixed chain progression tracking to use `chainId` instead of individual template IDs.
    *   All quests in a chain now share the same progress tracker.
    *   **Bug Fix**: Resolved issue where chain quests wouldn't unlock after completing previous steps.
*   **Content Expansion**:
    *   Added 6 daily quests: Copper Collection, Timber Supply, Pest Patrol, Iron Shipment, Stone Quota, Herb Gathering.
    *   Added 3 quest chains:
        *   **Ore Mastery** (I-III): Progressive mining challenges (5 → 15 → 30 copper ore).
        *   **Combat Training** (I-III): Sequential combat progression (rats → bandits → golems).
        *   **Woodcutting Mastery** (I-III): Lumberjack skill progression (20 → 50 → 100 wood).
*   **UI Enhancements**:
    *   Added current location display to Quest Board header.
    *   Improved quest progress event display in event log with merging support.

### AI-Generated Adventure Quests (Completed)

*   **New Quest Type - Adventures**:
    *   Added `'adventure'` objective type and activity type to support AI-generated quests.
    *   **Multi-Location Support**: Adventures can span multiple locations with location-specific steps.
    *   **Time-Based Progression**: Steps complete over 2-5 minutes with narrative updates.
*   **AI Generation Service**:
    *   Created `adventureQuestGeneration.ts` service for generating dynamic quests.
    *   **Context-Aware Prompting**: Uses current location, player level, available enemies/items.
    *   **Reward Scaling**: Automatically scales XP and gold based on player level.
    *   **Robust Parsing**: JSON parsing with fallback adventure for malformed responses.
*   **Engine Integration**:
    *   Implemented `GENERATE_ADVENTURE_QUEST` command handler.
    *   Added adventure activity handler with multi-location progression logic.
    *   **Location Checking**: Verifies player is at required location before step progression.
    *   **Reward Distribution**: Grants XP, gold, and items on adventure completion.
*   **UI Implementation**:
    *   Added prominent "✨ Generate AI Adventure Quest" button to Quest Board.
    *   **Adventure Steps Display**:
        *   Visual status indicators: ✓ (completed), ○ (available), 🔒 (locked).
        *   Location requirements shown with 📍 icon.
        *   Color-coded by status: green (at location), yellow (travel required), gray (locked).
    *   **Activity Detection**: Updated to recognize both quest and adventure activities.
    *   **Smart Button Logic**: Uses correct handler based on quest type (adventure vs regular).
*   **Features**:
    *   Each adventure is unique and procedurally generated.
    *   Dark fantasy themes with engaging narrative arcs.
    *   3-5 step adventures taking 2-5 minutes to complete.
    *   Better rewards than simple gather/kill quests.
    *   Optional multi-location progression for epic adventures.

### Technical Achievements

*   **Type Safety**: Extended `QuestInstanceState` with adventure-specific fields.
*   **Backward Compatibility**: Quest availability migration ensures old saves work seamlessly.
*   **Error Handling**: Graceful fallbacks for AI generation failures.
*   **Code Organization**: Clean separation between quest types and activity handlers.

## 2026-01-13

### Universal LLM Backend Integration (Completed)

*   **Multi-Provider LLM System**:
    *   Integrated Universal LLM Backend from `newtemp/` into RPG-Loom gateway.
    *   Converted JavaScript codebase to TypeScript with full type safety.
    *   **Supported Providers**: 7 total - Gemini (CLI + Cloud), OpenAI, Claude (CLI + Cloud), Codex CLI, Mock.
    *   **Architecture**: Adapter pattern for CLI tools, unified generator for all providers.
*   **Phase 1 - Provider Infrastructure**:
    *   Created `gateway/src/llm/` directory structure with providers, adapters, cloud clients, and unified generator.
    *   Installed Cloud API SDKs: `@google/generative-ai`, `openai`, `@anthropic-ai/sdk`.
    *   Implemented CLI adapters for Gemini, Claude, and Codex with JSON streaming support.
    *   Built Cloud API clients for Gemini, OpenAI, and Claude.
*   **Phase 2 - Narrative System Integration**:
    *   Updated `NarrativeTaskSchema` to support optional `model` field for per-request model selection.
    *   Replaced old `geminiCliGenerate` function (~90 lines) with unified `generateUnified()`.
    *   Added `getApiKeyForProvider()` helper for Cloud API authentication.
    *   **Backward Compatible**: All existing narrative tasks continue to work, no breaking changes.
*   **Phase 3 - General-Purpose Endpoints**:
    *   Added `POST /api/llm/generate` - Direct LLM generation for any use case.
    *   Added `GET /api/llm/providers` - Lists all available providers and models.
    *   Enables non-narrative AI features (quest enhancement, agent API, dynamic content).
*   **Testing**:
    *   Created comprehensive test scripts for all 3 phases.
    *   ✅ All TypeScript compilation passing.
    *   ✅ Mock backend tested and working.
    *   ✅ Gemini CLI tested with actual generation.
    *   ✅ Provider listing endpoint verified.

### AI Quest Enhancement Feature (Completed)

*   **Data Model Updates**:
    *   Added `aiNarrative` field to `QuestInstanceState` for storing AI-generated content.
    *   Implemented `ENHANCE_QUEST` command type in engine.
    *   Engine handler stores AI narrative with quest instances.
*   **Quest Enhancement Service**:
    *   Created `questEnhancement.ts` service with API integration.
    *   **Smart Prompt Building**: Contextual prompts based on quest type, target, location, and difficulty.
    *   **JSON Parsing**: Robust parsing with fallback handling for malformed responses.
    *   **Error Handling**: Graceful degradation when AI generation fails.
*   **UI Implementation**:
    *   Added "✨ Enhance with AI" button to active quests in `QuestView`.
    *   **Loading States**: Shows "✨ Enhancing..." while generating.
    *   **Visual Indicators**: AI-enhanced quests display purple glow and "✨ AI" badge.
    *   **AI Narrative Display**: Shows AI-generated title, description, and flavor text.
    *   **Disabled State**: Button shows "✨ Enhanced" and is disabled after enhancement.
*   **Features**:
    *   AI only affects narrative, not game mechanics (rewards, requirements unchanged).
    *   Enhancement is optional - players choose when to use AI.
    *   AI narrative persists in save data.
    *   Works with any configured LLM provider (defaults to Gemini CLI).
*   **Ready for Testing**: All TypeScript compilation passing, ready for manual testing in browser.

### Technical Achievements

*   **Code Quality**: Full TypeScript conversion with strict typing throughout.
*   **Architecture**: Clean separation of concerns (adapters, services, UI components).
*   **Testing**: Comprehensive test coverage with automated test scripts.
*   **Documentation**: Created implementation plans, test results, and API documentation.
*   **Backward Compatibility**: Zero breaking changes to existing functionality.

## 2026-01-05

### UI Readability & Refinement (Completed)

*   **Readability Overhaul**:
    *   Updated `ActivityView`, `EventView`, and `QuestView` to perform lookups in the `content` index.
    *   Replaced raw internal IDs (e.g., `loc_catacombs`, `item_copper_ore`) with human-readable names everywhere in the UI and event log.
*   **Debug Tools Reorganization**:
    *   **Relocation**: Moved all developer tools (Tick Rate control, Seed display, Level Recalculation) from the "Settings" modal to the dedicated "Debug" tab.
    *   **Interface Cleanup**: Removed the "Debug" tab from the main navigation menu to present a cleaner, user-focused interface while keeping dev tools accessible in the codebase.
    *   **Settings Focus**: The Settings modal is now strictly dedicated to Save Management (Import/Export) and Hard Reset.

### Training System & Combat Skills (Completed)

*   **Expanded Training**:
    *   Added dedicated training buttons for **Shield** (Defense), **Archery** (Marksmanship), and **Magic** (Arcana).
    *   Configured training to cost 1 Gold per tick, consistent with existing melee training.
*   **World Logic**:
    *   Restricted training activities to **Town** locations. The "Training Grounds" UI section now automatically hides when the player is in the wild.

### Build System & Bug Fixes (Completed)

*   **TypeScript Fix**: Resolved a persistent `minCombatLevel` error in the engine package by purging redundant and outdated `.d.ts` files in `packages/shared`. This fixed a source-of-truth conflict in the monorepo.
*   **ActivityView Fix**: Resolved a "Declaration or statement expected" syntax error in `ActivityView.tsx` caused by stray trailing brackets.
*   **Walkthrough**: Created and maintained a `walkthrough.md` to document feature verification and UI changes for the session.

## 2026-01-04

### Gathering Skills Debugging & Refactoring (Completed)

*   **Engine Refactoring**:
    *   Explicitly isolated `woodcut`, `mine`, and `forage` logic in `engine.ts` to ensuring robust error handling independent of other activities.
    *   Improved user feedback for gathering failures:
        *   "There are no trees/ore/forage here" (Missing Table).
        *   "You found nothing of interest" (Empty Loot Roll).
    *   Refined event ordering so `FLAVOR_TEXT` precedes `LOOT_GAINED`, allowing the UI to cleanly merge "Loot" and "XP" messages into a single line.
*   **Bug Fixes**:
    *   **Crash Fix**: Resolved a `TypeError: Cannot read properties of undefined (reading 'xp')` by implementing lazy initialization in `gainSkillXp`. Old saves now auto-migrate to support new skills without crashing.
    *   **Debug Tool Fix**: Fixed a race condition in `DebugView` where "Force One Tick" would fail if invoked immediately after a game loop tick.
*   **Tooling**:
    *   Created `DebugView.tsx` (accessible via new "Debug" tab) to inspect raw location data and force-step the engine client-side.

### Equipment & Balancing (Completed)

*   **UI Features**:
    *   **Equipment Manager**: Implemented dedicated equipment grid in Inventory, allowing direct inspection and simple drag-n-drop like interaction logic (click-to-equip/unequip).
    *   **Player Vitals**: Added prominent **HP Bar** to Activity Monitor, providing critical feedback during combat.
    *   **Visuals**: Standardized item slot appearance across Character and Inventory views.
*   **Balancing & Scaling**:
    *   **Scaling Caps**: Fixed issue where enemies scaled infinitely with player level. Implemented stricy `levelMin` / `levelMax` bounds for all enemies.
    *   **Content Patch**: Updated 12 early-game enemies (Rats, Bandits, etc.) with correct level metadata to prevent high-level players from facing Level 55 Rats.
    *   **Bug Fixes**: Resolved `NaN` stat errors by implementing robust default values for legacy content.
*   **Developer Tools**:
    *   **Item Spawner**: Added `Item Spawner` to Debug View, allowing rapid acquisition of test gear.

### Skills & Refactoring (Completed)

*   **Skill System Overhaul**:
    *   **Cleanup**: Permanently removed unused legacy skills (`tailoring`, `survival`, `archery`) from the codebase (`types.ts`, `schemas.ts`).
    *   **Display Logic**: Refactored `CharacterView` to use a strict allowlist. This robustly hides deleted skills from old save files (legacy support) while ensuring critical skills (mining, smithing) are always visible even at Level 0.
    *   **UI Clarity**: Renamed technical skill IDs to user-friendly labels (e.g., `swordsmanship` -> "Melee", `blacksmithing` -> "Smithing").
    *   **Tactics**: Removed the "Combat Stance" selector to streamline the character interface.
*   **Build System Health**:
    *   **SDK/Gateway Fixes**: Resolved critical TypeScript configuration errors (`rootDir` conflicts) that were silently failing background builds.
    *   **Dependencies**: Aligned package versions (`@rpg-loom/content`) and fixed missing types (`@types/uuid`) to ensure a clean `exit code 0` build across the entire monorepo.

## 2025-12-31

*   **Log Initialization**: Started this dev log to track progress.
## 2025-12-31

### Milestone C: UI MVP & Refinements (Completed)

*   **UI Architecture**:
    *   Implemented **Tabbed Navigation** (Activity, Inventory, Character, Quests, Settings).
    *   Clean, responsive layout with consistent header/footer and reliable event log.
*   **Gameplay Depth**:
    *   **Tactics Selector**: Added real-time combat stance switching (Aggressive/Balanced/Defensive).
    *   **Inventory Inspection**: Implemented `InventoryModal` to view item stats, types, and descriptions.
    *   **Data Fix**: Populated missing metadata (description, type, stats) for core items (Wood, Swords, Potions).
*   **System Features**:
    *   **Persistence UX**: Implemented `SettingsModal` with Import/Export (Base64) and Hard Reset functionality.
    *   **Debug Panel**: Added 'Fast Forward' (0.1s tick) and 'Normal' (1.0s tick) speed controls and transparent seed/tick tracking.

### Milestone C: UI MVP & Refinements (In Progress)

*   **UI Implementation**:
    *   Launched React-based web interface (`packages/ui`).
    *   Implemented core panels: Activity Monitor, Inventory Grid, Player Stats, and Event Log.
    *   Added visual indicators for current location and active combat state.
*   **UX Improvements**:
    *   **Combat Pacing**: Refactored combat engine to support multi-tick encounters. Combat now resolves over time (approx. 1 round/sec) rather than instantly, allowing players to observe the fight.
    *   **Log Aggregation**: Implemented event grouping in the UI. repetitious events (XP gain, Gold, Loot) are now summarized into single entries to improve readability.
*   **Technical**:
    *   Resolved critical React hook ordering issues causing "Rendered more hooks" crashes.
    *   Enforced strict typing for Content data (`QuestTemplateDef`) to prevent build-time errors.
    *   Fixed data/engine dependency cycles in the build pipeline.


## 2025-12-19

### Milestone B: Playable MVP Loop (Completed)

*   **Game Balance**:
    *   Implemented `Balance Instrumentation` (B9) to track XP/hr and Gold/hr.
    *   **Simulation Results**: Initial "linear" XP curve (`level * 100`) resulted in Level 73 after 1 hour of hunting.
    *   **Correction**: Switched to "quadratic" XP curve (`100 * level^2`). Verification simulation showed Level 9 after 1 hour, deemed appropriate.
    *   Verified "Peak" (Tier 4) biome correctly kills low-level players (0 XP gained).
*   **Economy**:
    *   Implemented **Economy Sinks** (B7). Training capabilities now cost 1 Gold/tick.
    *   Added `GOLD_CHANGED` event for tracking.
*   **Combat**:
    *   Implemented **Combat v1** (B2).
    *   Added `Recovery` activity (pure downtime) as a death penalty.
    *   Implemented `Tactics` (Aggressive/Balanced/Defensive) affecting stats.
*   **Content**:
    *   Expanded content to hit targets: 5 Locations, 12 Enemies, 40+ Items, 20 Quests.
    *   Fixed module declaration issues in `@rpg-loom/content`.

### Milestone A: Engine Foundations (Completed)

*   **Engine Core**:
    *   Finalized `step(state, nowMs)` deterministic loop.
    *   Implemented `simulateOffline` for catch-up mechanics.
    *   Verified seeded RNG and state invariants with golden tests.
*   **Project Structure**:
    *   Renamed namespace from `guildbound` to `rpg-loom`.
    *    established monorepo structure (`engine`, `content`, `shared`).


