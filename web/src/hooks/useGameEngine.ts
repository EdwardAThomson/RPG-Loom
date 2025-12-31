import { useState, useEffect, useRef } from 'react';
import type { EngineState, PlayerCommand } from '@rpg-loom/shared';
import { createNewState, step, applyCommand } from '@rpg-loom/engine';
import content from '@rpg-loom/content';

// Simple tick rate for now (1000ms = 1 tick/sec)
// Later we can go faster if needed, but 1s is good for idle pacing.
const TICK_RATE_MS = 1000;

export function useGameEngine() {
    // We keep the authoritative state in a ref to avoid stale closure issues in the loop
    // and only update the specialized React state for rendering.
    const stateRef = useRef<EngineState>(null);

    // React state for UI rendering
    const [uiState, setUiState] = useState<EngineState | null>(null);
    const [events, setEvents] = useState<any[]>([]);

    useEffect(() => {
        // Initialize state if not present (Load from save would go here later)
        if (!stateRef.current) {
            // Mock start params
            const now = Date.now();
            stateRef.current = createNewState({
                saveId: 'default_save',
                playerId: 'p1',
                playerName: 'Wanderer',
                nowMs: now,
                startLocationId: 'loc_forest' // Valid ID from content
            });
            setUiState(stateRef.current);
        }

        const intervalId = setInterval(() => {
            if (!stateRef.current) return;

            const now = Date.now();
            // Run engine step
            // Note: content cast might be needed if types aren't perfectly aligned in strict mode
            const res = step(stateRef.current, now, content as any);

            // Update authoritative ref
            stateRef.current = res.state;

            // Update UI (trigger re-render)
            setUiState(res.state);
            if (res.events.length > 0) {
                setEvents(prev => [...prev.slice(-50), ...res.events]); // Keep last 50 events
            }

        }, TICK_RATE_MS);

        return () => clearInterval(intervalId);
    }, []);

    const dispatch = (cmd: PlayerCommand) => {
        if (!stateRef.current) return;
        const res = applyCommand(stateRef.current, cmd);
        stateRef.current = res.state;
        setUiState(stateRef.current);
        // Immediate events from command?
        if (res.events.length > 0) {
            setEvents(prev => [...prev.slice(-50), ...res.events]);
        }
    };

    return { state: uiState, events, dispatch };
}
