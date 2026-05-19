import { describe, it, expect } from 'vitest';
import { applyCommand, createNewState, step } from '../engine.js';
import type { ContentIndex, EngineState } from '@rpg-loom/shared';

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
  npcsById: {}
};

function adventureState(): { state: EngineState; questId: string } {
  let state = createNewState({
    saveId: 'adv-test',
    playerId: 'p',
    playerName: 'Tester',
    nowMs: 1000,
    startLocationId: 'loc_haven'
  });

  // Inject a corrupt adventure: parent quest with one active step whose
  // `template` field is missing. spawnAdventureSubQuest will return null
  // for this — the bug the kill-switch defuses.
  const questId = 'q_broken_adv';
  state.quests.push({
    id: questId,
    templateId: 'dynamic_adventure',
    status: 'active',
    progress: { current: 0, required: 1 },
    locationId: 'loc_haven',
    createdAtMs: 1000,
    aiNarrative: { title: 'Broken Adventure' },
    adventureSteps: [
      {
        stepNumber: 1,
        status: 'active',
        // template is intentionally missing — the failure case.
        template: undefined as any,
        narrative: { description: 'You set out…' }
      }
    ]
  });

  // Player picks up the adventure activity.
  state = applyCommand(state, {
    type: 'SET_ACTIVITY',
    params: { type: 'adventure', questId } as any,
    atMs: 1000
  }, CONTENT).state;

  return { state, questId };
}

describe('Adventure auto-spawn kill switch', () => {
  it('marks the adventure failed and idles the activity on first unspawnable tick', () => {
    const { state: initial, questId } = adventureState();

    const res = step(initial, 2000, CONTENT);
    const adv = res.state.quests.find(q => q.id === questId);
    expect(adv?.status).toBe('failed');
    expect(res.state.activity.params.type).toBe('idle');

    const err = res.events.find(e => e.type === 'ERROR');
    expect(err).toBeDefined();
    expect((err as any).payload.code).toBe('ADVENTURE_STEP_UNSPAWNABLE');
  });

  it('does not re-fire the spawn path on subsequent ticks once failed', () => {
    const { state: initial, questId } = adventureState();

    // First step → marks failed.
    let state = step(initial, 2000, CONTENT).state;

    // Re-arm: set activity back to adventure (simulating UI hijack).
    // The guard should still hold because the quest's status is 'failed'.
    state = applyCommand(state, {
      type: 'SET_ACTIVITY',
      params: { type: 'adventure', questId } as any,
      atMs: state.lastTickAtMs
    }, CONTENT).state;

    const res = step(state, state.lastTickAtMs + 5000, CONTENT);
    const errors = res.events.filter(e => e.type === 'ERROR' && (e as any).payload.code === 'ADVENTURE_STEP_UNSPAWNABLE');
    // Exactly zero new error events — the loop is gated by status === 'active'.
    expect(errors).toHaveLength(0);
    expect(res.state.quests.find(q => q.id === questId)?.status).toBe('failed');
  });
});
