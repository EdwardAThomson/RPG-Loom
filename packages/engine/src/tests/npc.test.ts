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

  it('SET_NPC_FLAVOR persists generatedFlavor onto npcState', () => {
    const state = freshState();
    const res = applyCommand(state, {
      type: 'SET_NPC_FLAVOR',
      npcId: NPC_ID,
      flavor: {
        description: 'A weathered figure leaning on the counter.',
        dialogueLines: ['"Hot iron first.', '"Conversation second."']
      },
      atMs: 5000
    }, CONTENT);

    const entry = res.state.npcState[NPC_ID];
    expect(entry).toBeDefined();
    expect(entry.generatedFlavor).toBeDefined();
    expect(entry.generatedFlavor!.description).toBe('A weathered figure leaning on the counter.');
    expect(entry.generatedFlavor!.dialogueLines).toHaveLength(2);
    expect(entry.generatedFlavor!.generatedAtMs).toBe(5000);
  });

  it('SET_NPC_FLAVOR preserves existing affinity and interaction history', () => {
    let state = freshState();
    state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 2000 }, CONTENT).state;
    state = applyCommand(state, { type: 'TALK_TO_NPC', npcId: NPC_ID, atMs: 3000 }, CONTENT).state;
    const before = state.npcState[NPC_ID];
    expect(before.affinity).toBe(2);

    state = applyCommand(state, {
      type: 'SET_NPC_FLAVOR',
      npcId: NPC_ID,
      flavor: { description: 'x', dialogueLines: ['y'] },
      atMs: 4000
    }, CONTENT).state;

    const after = state.npcState[NPC_ID];
    expect(after.affinity).toBe(2);
    expect(after.firstMetAtMs).toBe(2000);
    expect(after.lastInteractionMs).toBe(3000);
    expect(after.generatedFlavor?.description).toBe('x');
  });

  it('SET_NPC_FLAVOR caps dialogueLines and rejects unknown npc', () => {
    const state = freshState();
    const many = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const res = applyCommand(state, {
      type: 'SET_NPC_FLAVOR',
      npcId: NPC_ID,
      flavor: { description: 'd', dialogueLines: many },
      atMs: 5000
    }, CONTENT);
    expect(res.state.npcState[NPC_ID].generatedFlavor!.dialogueLines).toHaveLength(8);

    const res2 = applyCommand(state, {
      type: 'SET_NPC_FLAVOR',
      npcId: 'npc_does_not_exist',
      flavor: { description: 'd', dialogueLines: ['x'] },
      atMs: 5000
    }, CONTENT);
    expect(res2.state.npcState['npc_does_not_exist']).toBeUndefined();
    expect(res2.events.find(e => e.type === 'ERROR')).toBeDefined();
  });

  it('emits NPC_NOT_HERE and writes no state when NPC is at a different location', () => {
    // Add a far-away location and an NPC who lives there.
    const farContent: ContentIndex = {
      ...CONTENT,
      locationsById: {
        ...CONTENT.locationsById,
        loc_distant: {
          id: 'loc_distant', name: 'Distant', description: '',
          activities: [], encounterTable: { entries: [] }
        } as any
      },
      npcsById: {
        ...CONTENT.npcsById,
        npc_far: {
          id: 'npc_far', name: 'Faraway Friend',
          role: 'generic', locationId: 'loc_distant', prompts: {}
        } as any
      }
    };
    const state = freshState(); // current location is loc_haven
    const res = applyCommand(state, { type: 'TALK_TO_NPC', npcId: 'npc_far', atMs: 2000 }, farContent);

    expect(res.state.npcState['npc_far']).toBeUndefined();
    const err = res.events.find(e => e.type === 'ERROR');
    expect(err).toBeDefined();
    expect((err as any).payload.code).toBe('NPC_NOT_HERE');
    // No NPC_INTERACTED should have fired.
    expect(res.events.find(e => e.type === 'NPC_INTERACTED')).toBeUndefined();
  });
});

describe('Quest-giver attribution', () => {
  const GIVER_ID = 'npc_giver';
  const QUEST_CONTENT: ContentIndex = {
    ...CONTENT,
    itemsById: {
      item_wood: { id: 'item_wood', name: 'Wood', stackable: true } as any
    },
    questTemplatesById: {
      qt_attributed: {
        id: 'qt_attributed',
        name: 'Attributed Errand',
        objectiveType: 'gather',
        targetItemId: 'item_wood',
        questGiverNpcId: GIVER_ID,
        locationPool: ['loc_haven'],
        qtyMin: 1,
        qtyMax: 1,
        difficulty: 1,
        rewardPack: { xp: 10, gold: 5 }
      } as any,
      qt_unattributed: {
        id: 'qt_unattributed',
        name: 'No-Giver Errand',
        objectiveType: 'gather',
        targetItemId: 'item_wood',
        locationPool: ['loc_haven'],
        qtyMin: 1,
        qtyMax: 1,
        difficulty: 1,
        rewardPack: { xp: 10, gold: 5 }
      } as any
    },
    npcsById: {
      ...CONTENT.npcsById,
      [GIVER_ID]: {
        id: GIVER_ID, name: 'The Giver',
        role: 'quartermaster', locationId: 'loc_haven', prompts: {}
      } as any
    }
  };

  it('ACCEPT_QUEST inherits npcId from template.questGiverNpcId', () => {
    const state = freshState();
    const res = applyCommand(state, {
      type: 'ACCEPT_QUEST', templateId: 'qt_attributed', atMs: 2000
    }, QUEST_CONTENT);

    const quest = res.state.quests.find(q => q.templateId === 'qt_attributed');
    expect(quest).toBeDefined();
    expect(quest?.npcId).toBe(GIVER_ID);

    const accepted = res.events.find(e => e.type === 'QUEST_ACCEPTED');
    expect((accepted as any).payload.npcId).toBe(GIVER_ID);
  });

  it('an explicit cmd.npcId wins over the template default', () => {
    const state = freshState();
    // Add a second NPC at the same location so the override is valid.
    const c2 = {
      ...QUEST_CONTENT,
      npcsById: {
        ...QUEST_CONTENT.npcsById,
        npc_other: { id: 'npc_other', name: 'Other', role: 'generic', locationId: 'loc_haven', prompts: {} } as any
      }
    };
    const res = applyCommand(state, {
      type: 'ACCEPT_QUEST', templateId: 'qt_attributed', npcId: 'npc_other', atMs: 2000
    }, c2);

    const quest = res.state.quests.find(q => q.templateId === 'qt_attributed');
    expect(quest?.npcId).toBe('npc_other');
  });

  it('templates without questGiverNpcId leave the instance npcId undefined', () => {
    const state = freshState();
    const res = applyCommand(state, {
      type: 'ACCEPT_QUEST', templateId: 'qt_unattributed', atMs: 2000
    }, QUEST_CONTENT);

    const quest = res.state.quests.find(q => q.templateId === 'qt_unattributed');
    expect(quest?.npcId).toBeUndefined();
  });

  // Completion-side affinity bump is covered in gameplay_loop.test.ts
  // because it requires the real activity loop to drive quest progress.
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
