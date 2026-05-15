import { useState, useEffect, useRef } from 'react';
import type { EngineState, PlayerCommand, ContentIndex, OfflineSummary } from '@rpg-loom/shared';
import { createNewState, step, applyCommand, simulateOffline, summarizeEvents, migrateState, FutureSaveError, MAX_OFFLINE_MS } from '@rpg-loom/engine';
import content, { CONTENT_VERSION } from '@rpg-loom/content';

// Simple tick rate for now (1000ms = 1 tick/sec)
// Later we can go faster if needed, but 1s is good for idle pacing.

// Show the offline summary modal if the player has been away longer than this.
const OFFLINE_SUMMARY_THRESHOLD_MS = 60_000;

export function useGameEngine() {
    // and only update the specialized React state for rendering.
    const stateRef = useRef<EngineState | null>(null);

    // React state for UI rendering
    const [uiState, setUiState] = useState<EngineState | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [tickRate, setTickRate] = useState(1000);
    const [pendingOfflineSummary, setPendingOfflineSummary] = useState<OfflineSummary | null>(null);

    const SAVE_KEY = 'rpg_loom_save_v1';

    // Helper: Save to local storage
    const saveState = (s: EngineState) => {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(s));
        } catch (e) {
            console.error('Failed to save', e);
        }
    };

    useEffect(() => {
        // Initialize state
        if (!stateRef.current) {
            // Try loading
            try {
                const saved = localStorage.getItem(SAVE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    stateRef.current = migrateState(parsed, CONTENT_VERSION);
                    console.log('Loaded save game');
                }
            } catch (e) {
                if (e instanceof FutureSaveError) {
                    alert(`Cannot load save: ${e.message}`);
                    // Don't fall back to a new game silently — refuse the load
                    // so the player sees the message and chooses to update or
                    // import a fresh save.
                    return;
                }
                console.warn('Failed to load save', e);
            }

            // Fallback to new game
            if (!stateRef.current) {
                const now = Date.now();
                stateRef.current = createNewState({
                    saveId: 'default_save',
                    playerId: 'p1',
                    playerName: 'Wanderer',
                    nowMs: now,
                    startLocationId: 'loc_forest',
                    contentVersion: CONTENT_VERSION
                });
                console.log('Created new game');
            } else {
                // Loaded an existing save: if a meaningful amount of time
                // has passed since the last tick, run the offline catch-up
                // and surface a summary modal.
                const now = Date.now();
                const elapsed = now - stateRef.current.lastTickAtMs;
                if (elapsed > OFFLINE_SUMMARY_THRESHOLD_MS) {
                    const cappedAtMs = elapsed > MAX_OFFLINE_MS ? MAX_OFFLINE_MS : undefined;
                    const res = simulateOffline(stateRef.current, stateRef.current.lastTickAtMs, now, content as any);
                    stateRef.current = res.state;
                    saveState(res.state);
                    if (res.events.length > 0) {
                        setEvents(prev => [...prev.slice(-50), ...res.events.slice(-15)]);
                    }
                    setPendingOfflineSummary(summarizeEvents(res.events, {
                        durationMs: Math.min(elapsed, MAX_OFFLINE_MS),
                        cappedAtMs
                    }));
                }
            }

            setUiState(stateRef.current);
        }

        const intervalId = setInterval(() => {
            if (!stateRef.current) return;

            const now = Date.now();
            // Run engine step
            const res = step(stateRef.current, now, content as any);

            // Update authoritative ref
            stateRef.current = res.state;

            // Auto-Save
            saveState(res.state);

            // Update UI (trigger re-render)
            setUiState(res.state);
            if (res.events.length > 0) {
                setEvents(prev => [...prev.slice(-50), ...res.events]);
            }

        }, tickRate);

        return () => clearInterval(intervalId);
    }, [tickRate]);

    const dispatch = (cmd: PlayerCommand) => {
        if (!stateRef.current) return;
        const res = applyCommand(stateRef.current, cmd, content as any);
        stateRef.current = res.state;
        saveState(res.state); // Save on interaction too
        setUiState(stateRef.current);
        if (res.events.length > 0) {
            setEvents(prev => [...prev.slice(-50), ...res.events]);
        }
    };

    const hardReset = () => {
        localStorage.removeItem(SAVE_KEY);
        window.location.reload();
    };

    const importSave = (saveString: string) => {
        try {
            // Validate base64
            const json = atob(saveString);
            const parsed = JSON.parse(json);
            // Basic duck typing check
            if (!parsed.inventory || !parsed.player) throw new Error("Invalid save structure");

            const migrated = migrateState(parsed, CONTENT_VERSION);
            stateRef.current = migrated;
            saveState(migrated);
            window.location.reload(); // Reload to ensure clean hook state
        } catch (e) {
            if (e instanceof FutureSaveError) {
                alert(`Import failed: ${e.message}`);
                return;
            }
            console.error("Import failed", e);
            alert("Import failed: Invalid save string");
        }
    };

    const exportSave = () => {
        if (!stateRef.current) return '';
        return btoa(JSON.stringify(stateRef.current));
    };

    const dismissOfflineSummary = () => setPendingOfflineSummary(null);

    return {
        state: uiState,
        events,
        dispatch,
        content: content as unknown as ContentIndex,
        hardReset,
        importSave,
        exportSave,
        tickRate,
        setTickRate,
        pendingOfflineSummary,
        dismissOfflineSummary
    };
}
