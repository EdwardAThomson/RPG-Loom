import { describe, it, expect } from 'vitest';
import { migrateState, FutureSaveError, createNewState, CURRENT_ENGINE_VERSION, ALL_SKILL_IDS } from '../engine.js';

const CONTENT_TAG = '2026-05-15';

function makeOldSave(overrides: any = {}): any {
  return {
    version: 1,
    saveId: 'legacy',
    createdAtMs: 1,
    updatedAtMs: 2,
    tickIndex: 0,
    lastTickAtMs: 0,
    nextEventId: 0,
    currentLocationId: 'loc_forest',
    player: {
      id: 'p1',
      name: 'Old Hero',
      level: 0,
      combatLevel: 0,
      xp: 0,
      gold: 0,
      tactics: 'balanced',
      baseStats: { hp: 25, hpMax: 25, atk: 5, def: 3, spd: 5, critChance: 0.05, critMult: 1.5, res: 0.05 },
      // no intrinsicStats — predates that field
      skills: {
        swordsmanship: { id: 'swordsmanship', level: 1, xp: 0 }
        // missing the other 9 skills
      },
      reputation: {},
      flags: {}
    },
    inventory: [],
    equipment: {},
    quests: [],
    // no questAvailability
    activity: { id: 'act_idle_0', params: { type: 'idle' }, startedAtMs: 0 },
    metrics: { startTimeMs: 0, startXp: 0, startGold: 0 },
    ...overrides
  };
}

describe('migrateState', () => {
  it('stamps engineVersion and contentVersion on a legacy save', () => {
    const old = makeOldSave();
    const migrated = migrateState(old, CONTENT_TAG);

    expect(migrated.engineVersion).toBe(CURRENT_ENGINE_VERSION);
    expect(migrated.contentVersion).toBe(CONTENT_TAG);
    // The old field name should be gone.
    expect((migrated as any).version).toBeUndefined();
  });

  it('backfills every skill that ALL_SKILL_IDS lists', () => {
    const old = makeOldSave();
    const migrated = migrateState(old, CONTENT_TAG);

    for (const skillId of ALL_SKILL_IDS) {
      expect(migrated.player.skills[skillId]).toBeDefined();
      expect(migrated.player.skills[skillId].level).toBeGreaterThanOrEqual(1);
    }
  });

  it('preserves existing skill XP/levels during backfill', () => {
    const old = makeOldSave();
    old.player.skills.swordsmanship = { id: 'swordsmanship', level: 7, xp: 4200 };
    const migrated = migrateState(old, CONTENT_TAG);

    expect(migrated.player.skills.swordsmanship.level).toBe(7);
    expect(migrated.player.skills.swordsmanship.xp).toBe(4200);
  });

  it('adds intrinsicStats by cloning baseStats when missing', () => {
    const old = makeOldSave();
    delete old.player.intrinsicStats;
    const migrated = migrateState(old, CONTENT_TAG);

    expect(migrated.player.intrinsicStats).toBeDefined();
    expect(migrated.player.intrinsicStats!.atk).toBe(old.player.baseStats.atk);
    // Should be a copy, not a reference — mutating one shouldn't affect the other.
    migrated.player.intrinsicStats!.atk = 999;
    expect(migrated.player.baseStats.atk).toBe(5);
  });

  it('adds an empty questAvailability when missing', () => {
    const old = makeOldSave();
    expect(old.questAvailability).toBeUndefined();
    const migrated = migrateState(old, CONTENT_TAG);

    expect(migrated.questAvailability).toEqual({});
  });

  it('throws FutureSaveError for an engineVersion higher than this build', () => {
    const futuristic = makeOldSave({ engineVersion: CURRENT_ENGINE_VERSION + 1 });
    expect(() => migrateState(futuristic, CONTENT_TAG)).toThrow(FutureSaveError);
  });

  it('re-stamps contentVersion to the current value', () => {
    const old = makeOldSave({ engineVersion: 1, contentVersion: 'ancient' });
    const migrated = migrateState(old, CONTENT_TAG);
    expect(migrated.contentVersion).toBe(CONTENT_TAG);
  });

  it('rejects non-object input', () => {
    expect(() => migrateState(null as any, CONTENT_TAG)).toThrow();
    expect(() => migrateState('save' as any, CONTENT_TAG)).toThrow();
  });

  it('round-trips a freshly created save without changes (other than re-stamp)', () => {
    const fresh = createNewState({
      saveId: 's',
      playerId: 'p',
      playerName: 'Tester',
      nowMs: 1000,
      startLocationId: 'loc_forest',
      contentVersion: CONTENT_TAG
    });
    const migrated = migrateState(fresh, CONTENT_TAG);
    expect(migrated.engineVersion).toBe(CURRENT_ENGINE_VERSION);
    expect(migrated.contentVersion).toBe(CONTENT_TAG);
    expect(migrated.player.skills.swordsmanship).toBeDefined();
  });
});

describe('createNewState', () => {
  it('stamps current engine and content versions', () => {
    const s = createNewState({
      saveId: 's',
      playerId: 'p',
      playerName: 'Tester',
      nowMs: 0,
      startLocationId: 'loc_forest',
      contentVersion: CONTENT_TAG
    });
    expect(s.engineVersion).toBe(CURRENT_ENGINE_VERSION);
    expect(s.contentVersion).toBe(CONTENT_TAG);
  });
});
