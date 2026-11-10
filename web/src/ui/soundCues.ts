import type { EngineState, GameEvent } from '@rpg-loom/shared';

/**
 * Which sound to play for a batch of engine events.
 *
 * Pure and deterministic so it can be unit tested; the actual synthesis
 * lives in services/sound.ts. One engine tick (or one command) can emit a
 * dozen events, so we pick the single most important cue per batch rather
 * than layering them into noise.
 */
export type SoundCue =
    | 'levelUp'
    | 'questComplete'
    | 'defeat'
    | 'questReady'
    | 'victory'
    | 'error'
    | 'loot'
    | 'coin'
    | 'questAccept'
    | 'encounter'
    | 'hit';

const PRIORITY: Record<SoundCue, number> = {
    levelUp: 100,
    questComplete: 90,
    defeat: 85,
    questReady: 80,
    victory: 70,
    error: 60,
    loot: 50,
    coin: 45,
    questAccept: 40,
    encounter: 35,
    hit: 20,
};

/**
 * Minimum gap between two plays of the same cue. Gathering yields loot on
 * most ticks and combat lands a hit every tick, so without this an idle
 * session would chirp every second.
 */
export const CUE_COOLDOWN_MS: Record<SoundCue, number> = {
    levelUp: 0,
    questComplete: 0,
    defeat: 0,
    questReady: 0,
    victory: 0,
    error: 1000,
    loot: 4000,
    coin: 1500,
    questAccept: 0,
    encounter: 0,
    hit: 2000,
};

function cueForEvent(e: GameEvent): SoundCue | null {
    switch (e.type) {
        case 'LEVEL_UP': return 'levelUp';
        case 'QUEST_COMPLETED': return 'questComplete';
        case 'QUEST_READY_FOR_TURN_IN': return 'questReady';
        case 'QUEST_ACCEPTED': return 'questAccept';
        case 'ENCOUNTER_STARTED': return 'encounter';
        case 'ENCOUNTER_RESOLVED':
            if (e.payload.outcome === 'win') return 'victory';
            if (e.payload.outcome === 'loss') return 'defeat';
            return null;
        case 'LOOT_GAINED': return 'loot';
        case 'ITEM_SOLD': return 'coin';
        // Upkeep drains gold by 1 every tick; only income gets a jingle.
        case 'GOLD_CHANGED': return e.payload.amount > 0 ? 'coin' : null;
        case 'ERROR': return 'error';
        default: return null;
    }
}

/**
 * Pick the cue for one batch of events. `prev`/`next` are the states either
 * side of the batch; they let us hear a combat round that didn't end the
 * fight (the engine emits no event for an ordinary hit).
 */
export function pickSoundCue(
    events: readonly GameEvent[],
    prev?: EngineState | null,
    next?: EngineState | null,
): SoundCue | null {
    let best: SoundCue | null = null;
    const consider = (c: SoundCue | null) => {
        if (c && (!best || PRIORITY[c] > PRIORITY[best])) best = c;
    };
    for (const e of events) consider(cueForEvent(e));

    const before = prev?.activeEncounter;
    const after = next?.activeEncounter;
    if (before && after && before.enemyId === after.enemyId && after.enemyHp < before.enemyHp) {
        consider('hit');
    }
    return best;
}

/** Cooldown gate: true if `cue` may play at `nowMs` given when each cue last played. */
export function cueReady(cue: SoundCue, nowMs: number, lastPlayedAt: Partial<Record<SoundCue, number>>): boolean {
    const last = lastPlayedAt[cue];
    return last === undefined || nowMs - last >= CUE_COOLDOWN_MS[cue];
}
