import { useState, useEffect, useRef } from 'react';
import type { EngineState, PlayerCommand, ContentIndex, OfflineSummary } from '@rpg-loom/shared';
import { createNewState, step, applyCommand, simulateOffline, summarizeEvents, migrateState, FutureSaveError, MAX_OFFLINE_MS } from '@rpg-loom/engine';
import content, { CONTENT_VERSION } from '@rpg-loom/content';
import { fetchSave, pushSave, type CloudSave } from '../services/cloudSave';
import { getAuthState, onAuthChange } from '../services/auth';

// Simple tick rate for now (1000ms = 1 tick/sec)
// Later we can go faster if needed, but 1s is good for idle pacing.

// Show the offline summary modal if the player has been away longer than this.
const OFFLINE_SUMMARY_THRESHOLD_MS = 60_000;

// How often to push to the cloud when signed in.
const CLOUD_PUSH_INTERVAL_MS = 30_000;

// Single-slot client (Phase 4d). Server-side schema supports multi-slot
// already; expanding here is a UI change only.
const CLOUD_SLOT = 0;

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface PendingConflict {
    local: EngineState;
    server: CloudSave;
}

export function useGameEngine() {
    // and only update the specialized React state for rendering.
    const stateRef = useRef<EngineState | null>(null);

    // React state for UI rendering
    const [uiState, setUiState] = useState<EngineState | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [tickRate, setTickRate] = useState(1000);
    const [pendingOfflineSummary, setPendingOfflineSummary] = useState<OfflineSummary | null>(null);

    // Cloud-sync state. Stored in refs (not React state) so the tick
    // loop can read them without dragging effect dependencies along.
    const lastPushedGenerationRef = useRef<number | null>(null);
    const lastPushedUpdatedAtMsRef = useRef<number>(0);
    const pushInFlightRef = useRef<boolean>(false);
    const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>('idle');
    const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

    const SAVE_KEY = 'rpg_loom_save_v1';

    // Helper: Save to local storage
    const saveState = (s: EngineState) => {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(s));
        } catch (e) {
            console.error('Failed to save', e);
        }
    };

    /**
     * Try a one-shot push to the cloud. Idempotent; safe to call from
     * the interval and from the manual "Sync now" button.
     */
    const cloudPush = async (): Promise<void> => {
        const state = stateRef.current;
        if (!state) return;
        if (getAuthState().status !== 'signed-in') return;
        if (pendingConflict) return; // wait for user to resolve
        if (pushInFlightRef.current) return; // serialize
        if (state.updatedAtMs <= lastPushedUpdatedAtMsRef.current) return; // no changes

        pushInFlightRef.current = true;
        setCloudStatus('syncing');
        try {
            const result = await pushSave(
                CLOUD_SLOT,
                state,
                lastPushedGenerationRef.current ?? undefined
            );
            if (result.kind === 'ok') {
                lastPushedGenerationRef.current = result.save.generation;
                lastPushedUpdatedAtMsRef.current = state.updatedAtMs;
                setCloudStatus('synced');
            } else if (result.kind === 'conflict') {
                setPendingConflict({ local: state, server: result.current });
                setCloudStatus('error');
            } else if (result.kind === 'unavailable' || result.kind === 'unauthenticated') {
                setCloudStatus('offline');
            }
        } catch (e) {
            console.warn('Cloud push failed', e);
            setCloudStatus('offline');
        } finally {
            pushInFlightRef.current = false;
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

        // Async: cloud-fetch on mount if signed in. Cloud wins for any
        // save strictly newer than what's in localStorage; otherwise we
        // keep local and the push interval will catch the server up.
        (async () => {
            if (getAuthState().status !== 'signed-in') return;
            try {
                setCloudStatus('syncing');
                const result = await fetchSave(CLOUD_SLOT);
                if (result.kind === 'ok') {
                    const cloudState = result.save.state;
                    const local = stateRef.current;
                    if (local && cloudState.updatedAtMs > local.updatedAtMs) {
                        const migrated = migrateState(cloudState, CONTENT_VERSION);
                        stateRef.current = migrated;
                        saveState(migrated);
                        setUiState(migrated);
                    }
                    lastPushedGenerationRef.current = result.save.generation;
                    lastPushedUpdatedAtMsRef.current = cloudState.updatedAtMs;
                    setCloudStatus('synced');
                } else if (result.kind === 'empty') {
                    // No cloud save yet — next push interval will create one.
                    lastPushedGenerationRef.current = null;
                    setCloudStatus('synced');
                } else {
                    setCloudStatus('offline');
                }
            } catch (e) {
                console.warn('Cloud fetch failed', e);
                setCloudStatus('offline');
            }
        })();

        const intervalId = setInterval(() => {
            if (!stateRef.current) return;

            const now = Date.now();
            const res = step(stateRef.current, now, content as any);

            stateRef.current = res.state;
            saveState(res.state);

            setUiState(res.state);
            if (res.events.length > 0) {
                setEvents(prev => [...prev.slice(-50), ...res.events]);
            }
        }, tickRate);

        const cloudIntervalId = setInterval(() => {
            void cloudPush();
        }, CLOUD_PUSH_INTERVAL_MS);

        // When the user signs in mid-session, kick off an immediate fetch
        // so we either adopt the server's save or set ourselves up to
        // push. Sign-out resets sync state.
        const unsubAuth = onAuthChange((auth) => {
            if (auth.status === 'signed-in') {
                lastPushedGenerationRef.current = null;
                lastPushedUpdatedAtMsRef.current = 0;
                (async () => {
                    try {
                        setCloudStatus('syncing');
                        const result = await fetchSave(CLOUD_SLOT);
                        if (result.kind === 'ok' && stateRef.current) {
                            const cloudState = result.save.state;
                            if (cloudState.updatedAtMs > stateRef.current.updatedAtMs) {
                                const migrated = migrateState(cloudState, CONTENT_VERSION);
                                stateRef.current = migrated;
                                saveState(migrated);
                                setUiState(migrated);
                            }
                            lastPushedGenerationRef.current = result.save.generation;
                            lastPushedUpdatedAtMsRef.current = cloudState.updatedAtMs;
                        }
                        setCloudStatus('synced');
                        // Push immediately if our local state is newer.
                        void cloudPush();
                    } catch (e) {
                        console.warn('Cloud post-signin fetch failed', e);
                        setCloudStatus('offline');
                    }
                })();
            } else {
                setCloudStatus('idle');
                lastPushedGenerationRef.current = null;
                lastPushedUpdatedAtMsRef.current = 0;
                setPendingConflict(null);
            }
        });

        return () => {
            clearInterval(intervalId);
            clearInterval(cloudIntervalId);
            unsubAuth();
        };
    }, [tickRate]);

    const dispatch = (cmd: PlayerCommand) => {
        if (!stateRef.current) return;
        const res = applyCommand(stateRef.current, cmd, content as any);
        stateRef.current = res.state;
        saveState(res.state);
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
            const json = atob(saveString);
            const parsed = JSON.parse(json);
            if (!parsed.inventory || !parsed.player) throw new Error("Invalid save structure");

            const migrated = migrateState(parsed, CONTENT_VERSION);
            stateRef.current = migrated;
            saveState(migrated);
            window.location.reload();
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

    /** Manual "Sync now" — exposed for the settings UI. */
    const syncNow = async () => {
        await cloudPush();
    };

    /** Resolve a conflict: keep our local state, force-overwrite the server. */
    const resolveConflictKeepLocal = async () => {
        const conflict = pendingConflict;
        if (!conflict || !stateRef.current) return;
        // Adopt the server's generation so the next push matches and wins.
        lastPushedGenerationRef.current = conflict.server.generation;
        setPendingConflict(null);
        await cloudPush();
    };

    /** Resolve a conflict: drop our local progress, adopt the server's state. */
    const resolveConflictUseServer = () => {
        const conflict = pendingConflict;
        if (!conflict) return;
        const migrated = migrateState(conflict.server.state, CONTENT_VERSION);
        stateRef.current = migrated;
        saveState(migrated);
        setUiState(migrated);
        lastPushedGenerationRef.current = conflict.server.generation;
        lastPushedUpdatedAtMsRef.current = migrated.updatedAtMs;
        setPendingConflict(null);
        setCloudStatus('synced');
    };

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
        dismissOfflineSummary,
        cloudStatus,
        pendingConflict,
        syncNow,
        resolveConflictKeepLocal,
        resolveConflictUseServer
    };
}
