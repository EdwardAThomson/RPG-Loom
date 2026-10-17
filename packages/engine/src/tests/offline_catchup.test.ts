import { describe, it, expect } from 'vitest';
import { createNewState, simulateOffline, MAX_OFFLINE_MS } from '../engine';
import { summarizeEvents } from '../summary';
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

const HOUR = 60 * 60 * 1000;

function awayDoing(params: any) {
  const state = createNewState({ saveId: 'afk', playerId: 'p', playerName: 'T', nowMs: 0, startLocationId: 'loc_forest' });
  state.activity = { id: 'act_afk', params, startedAtMs: 0 };
  return state;
}

describe('Offline catch-up on return', () => {
  it.each([
    ['hunting', { type: 'hunt', locationId: 'loc_forest' }],
    ['woodcutting', { type: 'woodcut', locationId: 'loc_forest' }],
  ])('summary XP and level-ups match what %s actually earned', (_label, params) => {
    const before = awayDoing(params);
    const res = simulateOffline(before, 0, 2 * HOUR, content);
    const summary = summarizeEvents(res.events, { durationMs: 2 * HOUR });

    expect(res.state.player.xp).toBeGreaterThan(0);
    expect(summary.xpGained).toBe(res.state.player.xp - before.player.xp);
    expect(summary.levelUps).toBeGreaterThan(0);
    expect(summary.levelUps).toBe(res.state.player.level - before.player.level);
  });

  it('is identical to having played the same stretch live', () => {
    // Offline catch-up must not be a different simulation from the
    // live 1s interval: same ticks, same seeds, same result.
    const offline = simulateOffline(awayDoing({ type: 'hunt', locationId: 'loc_forest' }), 0, HOUR, content).state;
    let live = awayDoing({ type: 'hunt', locationId: 'loc_forest' });
    for (let t = 1000; t <= HOUR; t += 1000) live = simulateOffline(live, live.lastTickAtMs, t, content).state;
    expect(live.player.skills).toEqual(offline.player.skills);
    expect(live.player.gold).toBe(offline.player.gold);
    expect(live.inventory).toEqual(offline.inventory);
  });

  it('forfeits time beyond the cap instead of replaying it on the next catch-up', () => {
    const threeDays = 3 * 24 * HOUR;
    const first = simulateOffline(awayDoing({ type: 'woodcut', locationId: 'loc_forest' }), 0, threeDays, content);
    expect(summarizeEvents(first.events, { durationMs: MAX_OFFLINE_MS }).ticksProcessed).toBe(MAX_OFFLINE_MS / 1000);

    // The web client re-runs catch-up whenever lastTickAtMs is more than a
    // minute behind the clock; it must find nothing left to do.
    const second = simulateOffline(first.state, first.state.lastTickAtMs, threeDays, content);
    expect(summarizeEvents(second.events, { durationMs: 0 }).ticksProcessed).toBe(0);
    expect(second.state.player.skills.woodcutting.xp).toBe(first.state.player.skills.woodcutting.xp);
  });
});
