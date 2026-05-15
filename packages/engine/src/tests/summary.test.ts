import { describe, it, expect } from 'vitest';
import { simulateOffline, createNewState, MAX_OFFLINE_MS } from '../engine.js';
import { summarizeEvents } from '../summary.js';
import type { GameEvent } from '@rpg-loom/shared';

const MOCK_CONTENT: any = {
  itemsById: {
    'item_wood': { id: 'item_wood', name: 'Wood', stackable: true, value: 1, tags: [], description: '', type: 'material', rarity: 'common' }
  },
  enemiesById: {
    'enemy_rat': {
      id: 'enemy_rat',
      name: 'Rat',
      tags: [],
      levelMin: 1,
      levelMax: 3,
      baseStats: { hpMax: 5, atk: 2, def: 0, spd: 3, critChance: 0, critMult: 1, res: 0 },
      lootTable: { entries: [{ itemId: 'item_wood', minQty: 1, maxQty: 1, weight: 1 }] }
    }
  },
  locationsById: {
    'loc_forest': {
      id: 'loc_forest',
      name: 'Forest',
      description: '',
      encounterTable: { entries: [{ enemyId: 'enemy_rat', weight: 1 }] },
      woodcuttingTable: { entries: [{ itemId: 'item_wood', minQty: 1, maxQty: 2, weight: 1 }] },
      activities: ['hunt', 'woodcut']
    }
  },
  questTemplatesById: {},
  recipesById: {}
};

describe('summarizeEvents', () => {
  it('rolls up the standard event types', () => {
    const events: GameEvent[] = [
      { id: 'e1', atMs: 0, type: 'TICK_PROCESSED', payload: { ticks: 12 } },
      { id: 'e2', atMs: 0, type: 'ENCOUNTER_RESOLVED', payload: { locationId: 'loc_forest', enemyId: 'enemy_rat', enemyLevel: 1, outcome: 'win' } },
      { id: 'e3', atMs: 0, type: 'ENCOUNTER_RESOLVED', payload: { locationId: 'loc_forest', enemyId: 'enemy_rat', enemyLevel: 1, outcome: 'win' } },
      { id: 'e4', atMs: 0, type: 'ENCOUNTER_RESOLVED', payload: { locationId: 'loc_forest', enemyId: 'enemy_rat', enemyLevel: 1, outcome: 'loss' } },
      { id: 'e5', atMs: 0, type: 'LOOT_GAINED', payload: { items: [{ itemId: 'item_wood', qty: 3 }] } },
      { id: 'e6', atMs: 0, type: 'LOOT_GAINED', payload: { items: [{ itemId: 'item_wood', qty: 2 }] } },
      { id: 'e7', atMs: 0, type: 'XP_GAINED', payload: { amount: 50, newTotal: 50 } },
      { id: 'e8', atMs: 0, type: 'XP_GAINED', payload: { amount: 30, newTotal: 80 } },
      { id: 'e9', atMs: 0, type: 'GOLD_CHANGED', payload: { amount: 10, newTotal: 10 } },
      { id: 'e10', atMs: 0, type: 'GOLD_CHANGED', payload: { amount: -3, newTotal: 7 } },
      { id: 'e11', atMs: 0, type: 'QUEST_COMPLETED', payload: { questId: 'q1', templateId: 'tmpl1', rewards: { xp: 0, gold: 0 } } },
      { id: 'e12', atMs: 0, type: 'LEVEL_UP', payload: { newLevel: 2 } },
      { id: 'e13', atMs: 0, type: 'FLAVOR_TEXT', payload: { message: 'ignore me' } }
    ];

    const summary = summarizeEvents(events, { durationMs: 60_000 });

    expect(summary.durationMs).toBe(60_000);
    expect(summary.ticksProcessed).toBe(12);
    expect(summary.kills['enemy_rat']).toBe(2);
    expect(summary.loot['item_wood']).toBe(5);
    expect(summary.xpGained).toBe(80);
    expect(summary.goldDelta).toBe(7);
    expect(summary.questsCompleted).toBe(1);
    expect(summary.levelUps).toBe(1);
  });

  it('returns a zeroed summary for an empty event stream', () => {
    const s = summarizeEvents([], { durationMs: 0 });
    expect(s).toEqual({
      durationMs: 0,
      ticksProcessed: 0,
      cappedAtMs: undefined,
      kills: {},
      loot: {},
      xpGained: 0,
      goldDelta: 0,
      questsCompleted: 0,
      levelUps: 0
    });
  });

  it('passes through cappedAtMs', () => {
    const s = summarizeEvents([], { durationMs: 1000, cappedAtMs: 500 });
    expect(s.cappedAtMs).toBe(500);
  });
});

describe('simulateOffline cap', () => {
  it('does not simulate beyond MAX_OFFLINE_MS', () => {
    const state = createNewState({
      saveId: 'cap-test',
      playerId: 'p1',
      playerName: 'Tester',
      nowMs: 0,
      startLocationId: 'loc_forest'
    });

    // Ask for 7 days; expect at most MAX_OFFLINE_MS of ticks.
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const res = simulateOffline(state, 0, sevenDays, MOCK_CONTENT);

    const elapsedMs = res.state.lastTickAtMs - state.lastTickAtMs;
    expect(elapsedMs).toBeLessThanOrEqual(MAX_OFFLINE_MS);
    expect(elapsedMs).toBeGreaterThan(MAX_OFFLINE_MS - 1500); // within one tick of cap
  });
});
