import { createNewState, step } from '../src/engine.js';
import items from '../../content/data/items.json' with { type: "json" };
import enemies from '../../content/data/enemies.json' with { type: "json" };
import locations from '../../content/data/locations.json' with { type: "json" };
import recipes from '../../content/data/recipes.json' with { type: "json" };
import questTemplates from '../../content/data/quest_templates.json' with { type: "json" };

const content = {
    itemsById: Object.fromEntries(items.map(x => [x.id, x])),
    enemiesById: Object.fromEntries(enemies.map(x => [x.id, x])),
    locationsById: Object.fromEntries(locations.map(x => [x.id, x])),
    recipesById: Object.fromEntries(recipes.map(x => [x.id, x])),
    questTemplatesById: Object.fromEntries(questTemplates.map(x => [x.id, x])),
};

function runSim(ticks: number, activityType: string, targetId: string) {
    const startMs = 0;
    const state = createNewState({
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

    console.log(`--- Simulating ${ticks} ticks of ${activityType} @ ${targetId} ---`);

    // Run fast
    const res = step(state, startMs + (ticks * 1000), content as any);

    const endXp = res.state.player.xp;
    const endGold = res.state.player.gold; // Note: currently no gold drops from mobs in engine basic loot logic (only items), selling items not instanced

    // Calculate Item Value gained
    let inventoryValue = 0;
    for (const stack of res.state.inventory) {
        const item = content.itemsById[stack.itemId];
        if (item) inventoryValue += item.value * stack.qty;
    }

    console.log(`XP Gained: ${endXp}`);
    console.log(`Gold (Raw): ${endGold}`);
    console.log(`Inventory Value: ${inventoryValue}`);
    console.log(`XP/Hr: ${(endXp / ticks) * 3600}`);
    console.log(`Gold Equivalent/Hr: ${((endGold + inventoryValue) / ticks) * 3600}`);
    console.log(`Level Reached: ${res.state.player.level}`);
}

// 1 Hour = 3600 ticks
runSim(3600, 'hunt', 'loc_forest'); // Early game
console.log('\n');
runSim(3600, 'hunt', 'loc_peak');   // Late game (Tier 4)
