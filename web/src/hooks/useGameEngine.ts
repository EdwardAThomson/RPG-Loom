import { useState, useEffect, useRef } from 'react';
import type { EngineState, PlayerCommand, ContentIndex } from '@rpg-loom/shared';
import { createNewState, step, applyCommand } from '@rpg-loom/engine';
import content from '@rpg-loom/content';

// Simple tick rate for now (1000ms = 1 tick/sec)
// Later we can go faster if needed, but 1s is good for idle pacing.
export function useGameEngine() {
    // and only update the specialized React state for rendering.
    const stateRef = useRef<EngineState | null>(null);

    // React state for UI rendering
    const [uiState, setUiState] = useState<EngineState | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [tickRate, setTickRate] = useState(1000);

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
                    // TODO: Runtime validation/migration could go here
                    stateRef.current = parsed;
                    console.log('Loaded save game');
                }
            } catch (e) {
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
                    startLocationId: 'loc_forest'
                });
                console.log('Created new game');
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

            stateRef.current = parsed;
            saveState(parsed);
            window.location.reload(); // Reload to ensure clean hook state
        } catch (e) {
            console.error("Import failed", e);
            alert("Import failed: Invalid save string");
        }
    };

    const exportSave = () => {
        if (!stateRef.current) return '';
        return btoa(JSON.stringify(stateRef.current));
    };

    return { state: uiState, events, dispatch, content: content as unknown as ContentIndex, hardReset, importSave, exportSave, tickRate, setTickRate };
}
