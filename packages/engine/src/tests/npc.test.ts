import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createNewState,
  migrateState,
  AFFINITY_CAP,
  CURRENT_ENGINE_VERSION,
  getQuestsOfferedByNpc
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

describe('getQuestsOfferedByNpc', () => {
  const GIVER_ID = 'npc_giver';
  // Quest activity is at loc_forest; giver lives at loc_haven. The player
  // is standing at loc_haven (next to the giver) and we expect the quest
  // to still surface — that's the whole point of the helper.
  const CONTENT_REMOTE_ACTIVITY: ContentIndex = {
    ...CONTENT,
    itemsById: { item_wood: { id: 'item_wood', name: 'Wood', stackable: true } as any },
    locationsById: {
      ...CONTENT.locationsById,
      loc_forest: {
        id: 'loc_forest', name: 'Forest', description: '',
        activities: [], encounterTable: { entries: [] }
      } as any
    },
    questTemplatesById: {
      qt_remote: {
        id: 'qt_remote',
        name: 'Gather from Afar',
        objectiveType: 'gather',
        targetItemId: 'item_wood',
        questGiverNpcId: GIVER_ID,
        locationPool: ['loc_forest'],
        qtyMin: 1, qtyMax: 1,
        difficulty: 1,
        rewardPack: { xp: 1, gold: 1 }
      } as any,
      qt_other_giver: {
        id: 'qt_other_giver',
        name: 'Someone Else\'s Job',
        objectiveType: 'gather',
        targetItemId: 'item_wood',
        questGiverNpcId: 'npc_other',
        locationPool: ['loc_haven'],
        qtyMin: 1, qtyMax: 1,
        difficulty: 1,
        rewardPack: { xp: 1, gold: 1 }
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

  it('surfaces a giver\'s quest even when the activity location is elsewhere', () => {
    const state = freshState();
    // Player is at loc_haven (the giver's location); the quest's activity
    // is at loc_forest. The Quest Board would hide this, but the giver
    // modal should not.
    const offered = getQuestsOfferedByNpc(state, CONTENT_REMOTE_ACTIVITY, GIVER_ID, 2000);
    expect(offered.map(t => t.id)).toEqual(['qt_remote']);
  });

  it('does not include quests attributed to a different NPC', () => {
    const state = freshState();
    const offered = getQuestsOfferedByNpc(state, CONTENT_REMOTE_ACTIVITY, GIVER_ID, 2000);
    expect(offered.find(t => t.id === 'qt_other_giver')).toBeUndefined();
  });

  it('hides a quest that is already active', () => {
    let state = freshState();
    state = applyCommand(state, {
      type: 'ACCEPT_QUEST', templateId: 'qt_remote', atMs: 2000
    }, CONTENT_REMOTE_ACTIVITY).state;

    const offered = getQuestsOfferedByNpc(state, CONTENT_REMOTE_ACTIVITY, GIVER_ID, 2000);
    expect(offered).toEqual([]);
  });

  it('hides a one-time quest that has already been completed', () => {
    const state = freshState();
    state.quests.push({
      id: 'q_done', templateId: 'qt_remote', status: 'completed',
      progress: { current: 1, required: 1 }, locationId: 'loc_forest',
      createdAtMs: 1000, completedAtMs: 2000, npcId: GIVER_ID
    } as any);

    const offered = getQuestsOfferedByNpc(state, CONTENT_REMOTE_ACTIVITY, GIVER_ID, 2000);
    expect(offered).toEqual([]);
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

describe('migrateState v2 → v3 (turn-in flow)', () => {
  it('parks 5/5 active quests with a giver at ready_to_turn_in', () => {
    const v2Save: any = {
      engineVersion: 2,
      saveId: 's', createdAtMs: 1, updatedAtMs: 2, tickIndex: 0, lastTickAtMs: 0, nextEventId: 0,
      currentLocationId: 'loc_haven',
      player: {
        id: 'p', name: 'X', level: 0, combatLevel: 0, xp: 0, gold: 0, tactics: 'balanced',
        baseStats: { hp: 25, hpMax: 25, atk: 5, def: 3, spd: 5, critChance: 0.05, critMult: 1.5, res: 0.05 },
        skills: {}, reputation: {}, flags: {}
      },
      inventory: [], equipment: {},
      quests: [
        // mid-flight, no giver — should stay active
        { id: 'q1', templateId: 'tmpl_a', status: 'active', progress: { current: 3, required: 5 }, locationId: 'loc_haven', createdAtMs: 0 },
        // hit 5/5 with a giver — should bump to ready_to_turn_in
        { id: 'q2', templateId: 'tmpl_b', status: 'active', progress: { current: 5, required: 5 }, locationId: 'loc_haven', npcId: 'npc_aldric', createdAtMs: 0 },
        // hit 5/5 with NO giver — should stay active (auto-complete path)
        { id: 'q3', templateId: 'tmpl_c', status: 'active', progress: { current: 5, required: 5 }, locationId: 'loc_haven', createdAtMs: 0 },
        // dynamic sub-quest at 5/5 — should stay active (no turn-in for dynamic)
        { id: 'q4', templateId: 'dynamic_kill_enemy_rat', status: 'active', progress: { current: 5, required: 5 }, locationId: 'loc_haven', npcId: 'npc_aldric', createdAtMs: 0 }
      ],
      questAvailability: {},
      activity: { id: 'act_idle_0', params: { type: 'idle' }, startedAtMs: 0 },
      metrics: { startTimeMs: 0, startXp: 0, startGold: 0 },
      npcState: {}
    };

    const migrated = migrateState(v2Save, '2026-05-18');
    expect(migrated.engineVersion).toBe(CURRENT_ENGINE_VERSION);
    const byId = Object.fromEntries(migrated.quests.map(q => [q.id, q]));
    expect(byId.q1.status).toBe('active');
    expect(byId.q2.status).toBe('ready_to_turn_in');
    expect(byId.q3.status).toBe('active');
    expect(byId.q4.status).toBe('active');
  });
});

describe('TURN_IN_QUEST command', () => {
  // A minimal content pack hosting one quest from one giver at loc_haven.
  const GIVER_ID = 'npc_aldric';
  const CONTENT_TURN_IN: ContentIndex = {
    ...CONTENT,
    itemsById: {
      item_wood: { id: 'item_wood', name: 'Wood', stackable: true } as any
    },
    questTemplatesById: {
      qt_turn_in: {
        id: 'qt_turn_in', name: 'Turn-In Errand',
        objectiveType: 'gather', targetItemId: 'item_wood',
        questGiverNpcId: GIVER_ID,
        locationPool: ['loc_forest'],
        qtyMin: 1, qtyMax: 1,
        difficulty: 1,
        rewardPack: { xp: 10, gold: 7 }
      } as any
    },
    npcsById: {
      ...CONTENT.npcsById,
      [GIVER_ID]: {
        id: GIVER_ID, name: 'Aldric',
        role: 'quartermaster', locationId: 'loc_haven', prompts: {}
      } as any
    },
    locationsById: {
      ...CONTENT.locationsById,
      loc_forest: { id: 'loc_forest', name: 'Forest', description: '', activities: [], encounterTable: { entries: [] } } as any
    }
  };

  function readyQuest(): { state: any; questId: string } {
    const state = freshState();
    const accepted = applyCommand(state, {
      type: 'ACCEPT_QUEST', templateId: 'qt_turn_in', atMs: 1000
    }, CONTENT_TURN_IN).state;
    const q = accepted.quests.find(x => x.templateId === 'qt_turn_in')!;
    q.progress.current = q.progress.required;
    q.status = 'ready_to_turn_in';
    return { state: accepted, questId: q.id };
  }

  it('credits rewards + bumps affinity when at giver location', () => {
    const { state: initial, questId } = readyQuest();
    expect(initial.currentLocationId).toBe('loc_haven'); // freshState starts at loc_haven
    const goldBefore = initial.player.gold;

    const res = applyCommand(initial, { type: 'TURN_IN_QUEST', questId, atMs: 2000 }, CONTENT_TURN_IN);
    expect(res.state.quests.find(q => q.id === questId)?.status).toBe('completed');
    expect(res.state.player.gold).toBe(goldBefore + 7);
    expect(res.state.npcState[GIVER_ID].affinity).toBeGreaterThanOrEqual(5);
    expect(res.events.find(e => e.type === 'QUEST_COMPLETED')).toBeDefined();
    expect(res.events.find(e => e.type === 'NPC_INTERACTED')).toBeDefined();
  });

  it('refuses turn-in when not at the giver\'s location', () => {
    const { state: ready, questId } = readyQuest();
    // Force the player elsewhere without TRAVELling (engine respects current state).
    const elsewhere = { ...ready, currentLocationId: 'loc_forest' };

    const res = applyCommand(elsewhere, { type: 'TURN_IN_QUEST', questId, atMs: 2000 }, CONTENT_TURN_IN);
    expect(res.state.quests.find(q => q.id === questId)?.status).toBe('ready_to_turn_in');
    const err = res.events.find(e => e.type === 'ERROR');
    expect((err as any)?.payload.code).toBe('NPC_NOT_HERE');
  });

  it('refuses turn-in if the quest is not at ready_to_turn_in', () => {
    const fresh = freshState();
    const accepted = applyCommand(fresh, {
      type: 'ACCEPT_QUEST', templateId: 'qt_turn_in', atMs: 1000
    }, CONTENT_TURN_IN).state;
    const q = accepted.quests.find(x => x.templateId === 'qt_turn_in')!;
    // Still 'active' (no progress yet).
    const res = applyCommand(accepted, { type: 'TURN_IN_QUEST', questId: q.id, atMs: 2000 }, CONTENT_TURN_IN);
    expect(res.state.quests[0].status).toBe('active');
    const err = res.events.find(e => e.type === 'ERROR');
    expect((err as any)?.payload.code).toBe('QUEST_NOT_READY');
  });
});
