import { describe, it, expect } from 'vitest';
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

function freshHunter() {
  const state = createNewState({ saveId: 'pace', playerId: 'p', playerName: 'T', nowMs: 0, startLocationId: 'loc_forest' });
  state.activity = { id: 'act_hunt', params: { type: 'hunt', locationId: 'loc_forest' }, startedAtMs: 0 };
  return state;
}

describe('Early-game pacing', () => {
  it('a new gatherer reaches level 2 within 30 ticks', () => {
    const state = createNewState({ saveId: 'pace', playerId: 'p', playerName: 'T', nowMs: 0, startLocationId: 'loc_forest' });
    state.activity = { id: 'act_wc', params: { type: 'woodcut', locationId: 'loc_forest' }, startedAtMs: 0 };
    const res = step(state, 30_000, content);
    expect(res.state.player.skills.woodcutting.level).toBe(2);
  });

  it('scales enemies off combat skills, not total level', () => {
    // A fresh character has total level 10 but combat skills at 1, so
    // forest enemies should spawn at the bottom of their range.
    const res = step(freshHunter(), 20_000, content);
    const starts = res.events.filter(e => e.type === 'ENCOUNTER_STARTED') as any[];
    expect(starts.length).toBeGreaterThan(0);
    for (const e of starts) {
      const levelMin = content.enemiesById[e.payload.enemyId].levelMin ?? 1;
      expect(e.payload.enemyLevel).toBeLessThanOrEqual(Math.max(levelMin, 2));
    }
  });

  it('resumes the interrupted activity after a knockout', () => {
    const state = freshHunter();
    state.player.baseStats.hp = 1; // the wolf's first hit knocks the player out
    state.activeEncounter = { enemyId: 'enemy_wolf', enemyLevel: 3, enemyHp: 999, enemyMaxHp: 999 };
    let res = step(state, 1_000, content);
    const loss = res.events.find(e => e.type === 'ENCOUNTER_RESOLVED' && (e as any).payload.outcome === 'loss');
    expect(loss).toBeDefined();
    expect(res.state.activity.params.type).toBe('recovery');

    res = step(res.state, 20_000, content);
    expect(res.state.activity.params).toEqual({ type: 'hunt', locationId: 'loc_forest' });
  });

  it('a manual rest still ends in idle', () => {
    const state = createNewState({ saveId: 'pace', playerId: 'p', playerName: 'T', nowMs: 0, startLocationId: 'loc_forest' });
    state.activity = { id: 'act_rest', params: { type: 'recovery', durationMs: 10_000 }, startedAtMs: 0 };
    const res = step(state, 11_000, content);
    expect(res.state.activity.params.type).toBe('idle');
  });
});
