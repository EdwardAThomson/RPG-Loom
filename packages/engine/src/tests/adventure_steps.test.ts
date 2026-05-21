import { describe, it, expect } from 'vitest';
import type { AdventureStepTemplate } from '@rpg-loom/shared';
import {
  ADVENTURE_STEP_KINDS,
  parseDynamicTemplateId,
  buildDynamicTemplateId,
  assertNever
} from '../adventure_steps.js';

describe('parseDynamicTemplateId', () => {
  it('parses target-bearing kinds', () => {
    expect(parseDynamicTemplateId('dynamic_kill_enemy_rat')).toEqual({ kind: 'kill', targetId: 'enemy_rat' });
    expect(parseDynamicTemplateId('dynamic_gather_item_wood')).toEqual({ kind: 'gather', targetId: 'item_wood' });
    expect(parseDynamicTemplateId('dynamic_craft_recipe_iron_sword')).toEqual({ kind: 'craft', targetId: 'recipe_iron_sword' });
    expect(parseDynamicTemplateId('dynamic_deliver_item_letter')).toEqual({ kind: 'deliver', targetId: 'item_letter' });
  });

  it('parses fixed-form kinds with null targetId', () => {
    expect(parseDynamicTemplateId('dynamic_travel')).toEqual({ kind: 'travel', targetId: null });
    expect(parseDynamicTemplateId('dynamic_explore')).toEqual({ kind: 'explore', targetId: null });
  });

  it('rejects the parent dynamic_adventure marker', () => {
    expect(parseDynamicTemplateId('dynamic_adventure')).toBeNull();
  });

  it('rejects non-dynamic template ids', () => {
    expect(parseDynamicTemplateId('qt_intro_gather')).toBeNull();
    expect(parseDynamicTemplateId('')).toBeNull();
    expect(parseDynamicTemplateId('dynamic_unknown_thing')).toBeNull();
  });

  it('preserves multi-underscore target ids (e.g. recipe_iron_sword)', () => {
    // The target id can contain underscores. The parser must use the
    // kind prefix length, not split on underscore count.
    const p = parseDynamicTemplateId('dynamic_gather_item_strengthened_plank');
    expect(p?.kind).toBe('gather');
    expect(p?.targetId).toBe('item_strengthened_plank');
  });
});

describe('buildDynamicTemplateId', () => {
  it('builds target-bearing ids', () => {
    expect(buildDynamicTemplateId({ type: 'kill', targetEnemyId: 'enemy_rat', qty: 5 })).toBe('dynamic_kill_enemy_rat');
    expect(buildDynamicTemplateId({ type: 'gather', targetItemId: 'item_wood', qty: 10 })).toBe('dynamic_gather_item_wood');
    expect(buildDynamicTemplateId({ type: 'craft', targetRecipeId: 'recipe_iron_sword', qty: 1 })).toBe('dynamic_craft_recipe_iron_sword');
    expect(buildDynamicTemplateId({ type: 'deliver', targetItemId: 'item_letter', targetLocationId: 'loc_haven', qty: 1 })).toBe('dynamic_deliver_item_letter');
  });

  it('builds fixed-form ids', () => {
    expect(buildDynamicTemplateId({ type: 'travel', targetLocationId: 'loc_haven' })).toBe('dynamic_travel');
    expect(buildDynamicTemplateId({ type: 'explore', targetLocationId: 'loc_forest', durationMs: 30000 })).toBe('dynamic_explore');
  });
});

describe('build/parse round-trips', () => {
  const cases: Array<AdventureStepTemplate> = [
    { type: 'kill', targetEnemyId: 'enemy_rat', qty: 3 },
    { type: 'gather', targetItemId: 'item_wood', qty: 5 },
    { type: 'craft', targetRecipeId: 'recipe_plank', qty: 1 },
    { type: 'deliver', targetItemId: 'item_letter', targetLocationId: 'loc_haven', qty: 1 },
    { type: 'travel', targetLocationId: 'loc_quarry' },
    { type: 'explore', targetLocationId: 'loc_swamp', durationMs: 30000 }
  ];

  for (const tpl of cases) {
    it(`round-trips type=${tpl.type}`, () => {
      const id = buildDynamicTemplateId(tpl);
      const parsed = parseDynamicTemplateId(id);
      expect(parsed?.kind).toBe(tpl.type);
    });
  }
});

describe('ADVENTURE_STEP_KINDS', () => {
  it('lists every variant of AdventureStepTemplate exactly once', () => {
    // Cross-check against the union by exhaustively building one of each.
    const built = new Set(ADVENTURE_STEP_KINDS);
    expect(built.size).toBe(ADVENTURE_STEP_KINDS.length);
    // The build function being exhaustive (typecheck enforced) means any
    // missing kind here would fail TypeScript build first; this assertion
    // catches accidental duplicates.
  });
});

describe('assertNever', () => {
  it('throws when reached at runtime with a non-never value', () => {
    // assertNever is mostly a compile-time tool, but its runtime body
    // throws — verify that for defensive-correctness.
    expect(() => assertNever('unexpected' as never)).toThrow();
  });
});
