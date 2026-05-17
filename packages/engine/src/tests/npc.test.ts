import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createNewState,
  migrateState,
  AFFINITY_CAP,
  CURRENT_ENGINE_VERSION
} from '../engine.js';
import type { ContentIndex } from '@rpg-loom/shared';

const NPC_ID = 'npc_test';

const CONTENT: ContentIndex = {
  itemsById: {},
  enemiesById: {},
  locationsById: {
    loc_haven: {
      id: 'loc_haven', name: 'Haven', description: '',
      activities: [], encounterTable: { entries: [] }
    } as any
  },
  questTemplatesById: {},
  recipesById: {},
  npcsById: {
    [NPC_ID]: {
      id: NPC_ID,
      name: 'Test NPC',
      role: 'generic',
      locationId: 'loc_haven',
      prompts: { greeting: 'hi' }
    } as any
  }
};

function freshState() {
  return createNewState({
    saveId: 'npc-test',
    playerId: 'p',
    playerName: 'Tester',
    nowMs: 1000,
    startLocationId: 'loc_haven'
  });
}

describe('createNewState (Phase 3a)', () => {
  it('initializes npcState as an empty record', () => {
    const state = freshState();
    expect(state.npcState).toEqual({});
  });

  it('stamps the bumped engine version', () => {
    const state = freshState();
    expect(state.engineVersion).toBe(CURRENT_ENGINE_VERSION);
    expect(CURRENT_ENGINE_VERSION).toBeGreaterThanOrEqual(2);
  });
});

describe('TALK_TO_NPC command', () => {
  it('first interaction stamps firstMetAtMs and emits firstMeet: true', () => {
    const state = freshState();
    const res = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 2000 }, CONTENT);

    const entry = res.state.npcState[NPC_ID];
    expect(entry).toBeDefined();
    expect(entry.firstMetAtMs).toBe(2000);
    expect(entry.lastInteractionMs).toBe(2000);
    expect(entry.affinity).toBe(1);

    const interactedEv = res.events.find(e => e.type === 'NPC_INTERACTED');
    expect(interactedEv).toBeDefined();
    expect((interactedEv as any).payload.firstMeet).toBe(true);
  });

  it('subsequent interactions keep firstMetAtMs and bump affinity', () => {
    let state = freshState();
    state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 2000 }, CONTENT).state;
    const res = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 3500 }, CONTENT);

    const entry = res.state.npcState[NPC_ID];
    expect(entry.firstMetAtMs).toBe(2000);
    expect(entry.lastInteractionMs).toBe(3500);
    expect(entry.affinity).toBe(2);

    const interactedEv = res.events.find(e => e.type === 'NPC_INTERACTED');
    expect((interactedEv as any).payload.firstMeet).toBe(false);
  });

  it('caps affinity at AFFINITY_CAP', () => {
    let state = freshState();
    // Talk way more than the cap allows. The cap should hold.
    for (let i = 0; i < AFFINITY_CAP + 20; i++) {
      state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 1000 + i }, CONTENT).state;
    }
    expect(state.npcState[NPC_ID].affinity).toBe(AFFINITY_CAP);
  });

  it('emits ERROR for an unknown NPC id and does not write npcState', () => {
    const state = freshState();
    const res = applyCommand(state, { type: 'TALK_TO_NPC', npcId: 'npc_does_not_exist', atMs: 2000 }, CONTENT);
    expect(res.state.npcState['npc_does_not_exist']).toBeUndefined();
    expect(res.events.find(e => e.type === 'ERROR')).toBeDefined();
  });

  it('is independent across NPCs', () => {
    let state = freshState();
    state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 2000 }, CONTENT).state;
    state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 3000 }, CONTENT).state;
    // Make a second NPC known.
    const content2 = {
      ...CONTENT,
      npcsById: {
        ...CONTENT.npcsById,
        npc_other: {
          id: 'npc_other', name: 'Other', role: 'generic', locationId: 'loc_haven', prompts: {}
        } as any
      }
    };
    state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: 'npc_other', atMs: 4000 }, content2).state;
    expect(state.npcState[NPC_ID].affinity).toBe(2);
    expect(state.npcState['npc_other'].affinity).toBe(1);
  });
});

describe('migrateState v1 → v2 (Phase 3a)', () => {
  it('backfills npcState as empty record for a v1 save', () => {
    const v1Save: any = {
      engineVersion: 1,
      contentVersion: '2026-05-15',
      saveId: 'old',
      createdAtMs: 1, updatedAtMs: 2, tickIndex: 0, lastTickAtMs: 0, nextEventId: 0,
      currentLocationId: 'loc_haven',
      player: {
        id: 'p', name: 'Old', level: 0, combatLevel: 0, xp: 0, gold: 0,
        tactics: 'balanced',
        baseStats: { hp: 25, hpMax: 25, atk: 5, def: 3, spd: 5, critChance: 0.05, critMult: 1.5, res: 0.05 },
        skills: {}, reputation: {}, flags: {}
      },
      inventory: [], equipment: {}, quests: [], questAvailability: {},
      activity: { id: 'act_idle_0', params: { type: 'idle' }, startedAtMs: 0 },
      metrics: { startTimeMs: 0, startXp: 0, startGold: 0 }
      // no npcState field
    };

    const migrated = migrateState(v1Save, '2026-05-15');
    expect(migrated.engineVersion).toBe(CURRENT_ENGINE_VERSION);
    expect(migrated.npcState).toEqual({});
  });

  it('preserves existing npcState when migrating', () => {
    const v2ish: any = {
      engineVersion: 1,
      saveId: 's', createdAtMs: 1, updatedAtMs: 2, tickIndex: 0, lastTickAtMs: 0, nextEventId: 0,
      currentLocationId: 'loc_haven',
      player: {
        id: 'p', name: 'X', level: 0, combatLevel: 0, xp: 0, gold: 0, tactics: 'balanced',
        baseStats: { hp: 25, hpMax: 25, atk: 5, def: 3, spd: 5, critChance: 0.05, critMult: 1.5, res: 0.05 },
        skills: {}, reputation: {}, flags: {}
      },
      inventory: [], equipment: {}, quests: [], questAvailability: {},
      activity: { id: 'act_idle_0', params: { type: 'idle' }, startedAtMs: 0 },
      metrics: { startTimeMs: 0, startXp: 0, startGold: 0 },
      npcState: { npc_existing: { firstMetAtMs: 5, lastInteractionMs: 7, affinity: 3 } }
    };

    const migrated = migrateState(v2ish, '2026-05-15');
    expect(migrated.npcState.npc_existing.affinity).toBe(3);
    expect(migrated.npcState.npc_existing.firstMetAtMs).toBe(5);
  });
});
