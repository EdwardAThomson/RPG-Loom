# Developer Log

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


