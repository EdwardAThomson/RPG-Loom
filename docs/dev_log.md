# Developer Log

## 2025-12-31

*   **Log Initialization**: Started this dev log to track progress.

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


