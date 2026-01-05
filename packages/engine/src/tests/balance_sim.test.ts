import { describe, it } from 'vitest';
import { createNewState, step } from '../engine';
import items from '../../../content/data/items.json';
import enemies from '../../../content/data/enemies.json';
import locations from '../../../content/data/locations.json';
import recipes from '../../../content/data/recipes.json';
import questTemplates from '../../../content/data/quest_templates.json';

const content: any = {
    itemsById: Object.fromEntries(items.map((x: any) => [x.id, x])),
    enemiesById: Object.fromEntries(enemies.map((x: any) => [x.id, x])),
    locationsById: Object.fromEntries(locations.map((x: any) => [x.id, x])),
    recipesById: Object.fromEntries(recipes.map((x: any) => [x.id, x])),
    questTemplatesById: Object.fromEntries(questTemplates.map((x: any) => [x.id, x])),
};

describe('Balance Simulation', () => {
    // We use .skip or just a normal test that logs functionality. 
    // Since we want to see output, we can use console.log and --reporter=verbose
    it('Simulates 1 Hour of Gameplay', () => {
        const resForest = runSim(3600, 'hunt', 'loc_forest');
        const level = resForest.state.player.level;
        // Expect reasonable progression (e.g. starting at 10, reach 15-30)
        if (level > 40) {
            throw new Error(`Leveling too fast! Reached level ${level} in 1 hour.`);
        }
        if (level < 11) {
            throw new Error(`Leveling too slow? Only reached level ${level} in 1 hour.`);
        }
        console.log(`Forest Sim Level Reached: ${resForest.state.player.level}`);

        const resPeak = runSim(3600, 'hunt', 'loc_peak');
        if (resPeak.state.player.xp > 0) {
            console.warn('Peak should rely on higher levels, but got XP? Check balance.');
        }
    });
});

function runSim(ticks: number, activityType: string, targetId: string) {
    const startMs = 0;
    let state = createNewState({
        saveId: 'sim_balance',
        playerId: 'p1',
        playerName: 'Tester',
        nowMs: startMs,
        startLocationId: 'loc_forest'
    });

    // Setup activity
    if (activityType === 'hunt') {
        state.activity = {
            id: 'act_sim',
            params: { type: 'hunt', locationId: targetId },
            startedAtMs: startMs
        };
        state.currentLocationId = targetId;
    }

    console.log(`\n--- Simulating ${ticks} ticks of ${activityType} @ ${targetId} ---`);

    // Run simulation loop
    let currentMs = startMs;
    const endMs = startMs + (ticks * 1000);
    // Process in 10-second chunks to allow checking state
    const CHUNK_MS = 10000;

    let res: any = { state, events: [] };

    while (currentMs < endMs) {
        // Auto-resume hunt if idle
        if (state.activity.params.type === 'idle' && activityType === 'hunt') {
            state.activity = {
                id: `act_sim_${state.tickIndex}`,
                params: { type: 'hunt', locationId: targetId },
                startedAtMs: currentMs
            };
            state.activeEncounter = undefined; // Ensure clean state
        }

        const nextMs = Math.min(endMs, currentMs + CHUNK_MS);
        res = step(state, nextMs, content);
        state = res.state;
        currentMs = nextMs;
    }

    // Debug: Print first 5 events if result is empty
    if (res.state.player.xp === 0 && activityType === 'hunt') {
        // Keep this one for failure analysis, but maybe less verbose?
        // console.log('Zero XP gained. First 5 events:', JSON.stringify(res.events.slice(0, 5), null, 2));
    }

    const endXp = res.state.player.xp;
    const endGold = res.state.player.gold;

    // Calculate Item Value gained
    let inventoryValue = 0;
    for (const stack of res.state.inventory) {
        const item = content.itemsById[stack.itemId];
        if (item) inventoryValue += item.value * stack.qty;
    }

    console.log(`XP Gained: ${endXp}`);
    console.log(`Gold (Raw): ${endGold}`);
    console.log(`Inventory Value: ${inventoryValue}`);
    console.log(`Total Value/Hr: ${((endGold + inventoryValue) / ticks) * 3600}`);
    console.log(`Level Reached: ${res.state.player.level}`);
    return res;
}
