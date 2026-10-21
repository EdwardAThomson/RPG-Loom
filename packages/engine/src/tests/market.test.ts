import { describe, it, expect } from 'vitest';
import { applyCommand, createNewState } from '../engine';
import { sellValue } from '../market';

const content: any = {
  itemsById: {
    item_ore: { id: 'item_ore', name: 'Ore', type: 'material', value: 10 },
    item_wood: { id: 'item_wood', name: 'Wood', type: 'resource', value: 1 },
    item_rock: { id: 'item_rock', name: 'Rock', type: 'resource', value: 0 }
  },
  enemiesById: {},
  locationsById: {},
  questTemplatesById: {},
  recipesById: {}
};

function withOre(qty: number) {
  const state = createNewState({ saveId: 'mkt', playerId: 'p1', playerName: 'Hero', nowMs: 1000, startLocationId: 'loc_home' });
  state.player.gold = 0;
  state.inventory = [{ itemId: 'item_ore', qty }];
  return state;
}

describe('SELL_ITEM', () => {
  it('sells a whole stack in one command at half value', () => {
    const res = applyCommand(withOre(12), { type: 'SELL_ITEM', itemId: 'item_ore', qty: 12, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(60);
    expect(res.state.inventory).toEqual([]);
    expect(res.events.find(e => e.type === 'ITEM_SOLD')?.payload).toEqual({ itemId: 'item_ore', qty: 12, gold: 60 });
  });

  it('sells part of a stack', () => {
    const res = applyCommand(withOre(12), { type: 'SELL_ITEM', itemId: 'item_ore', qty: 5, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(25);
    expect(res.state.inventory).toEqual([{ itemId: 'item_ore', qty: 7 }]);
  });

  it('rejects more than the player owns', () => {
    const res = applyCommand(withOre(3), { type: 'SELL_ITEM', itemId: 'item_ore', qty: 4, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(0);
    expect(res.events[0]).toMatchObject({ type: 'ERROR', payload: { code: 'ITEM_NOT_OWNED' } });
  });

  it.each([0, -2, 1.5])('rejects a quantity of %s', qty => {
    const res = applyCommand(withOre(3), { type: 'SELL_ITEM', itemId: 'item_ore', qty, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(0);
    expect(res.state.inventory).toEqual([{ itemId: 'item_ore', qty: 3 }]);
    expect(res.events[0]).toMatchObject({ type: 'ERROR', payload: { code: 'INVALID_QTY' } });
  });

  it('never sells cheap items for nothing', () => {
    const state = withOre(0);
    state.inventory = [{ itemId: 'item_wood', qty: 37 }];
    const res = applyCommand(state, { type: 'SELL_ITEM', itemId: 'item_wood', qty: 37, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(14);
    expect(res.state.inventory).toEqual([]);
  });

  it('refuses to buy worthless items and keeps them', () => {
    const state = withOre(0);
    state.inventory = [{ itemId: 'item_rock', qty: 5 }];
    const res = applyCommand(state, { type: 'SELL_ITEM', itemId: 'item_rock', qty: 5, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(0);
    expect(res.state.inventory).toEqual([{ itemId: 'item_rock', qty: 5 }]);
    expect(res.events[0]).toMatchObject({ type: 'ERROR', payload: { code: 'NO_OFFER' } });
  });
});

describe('BUY_ITEM', () => {
  it('rejects a negative quantity instead of paying the player', () => {
    const res = applyCommand(withOre(0), { type: 'BUY_ITEM', itemId: 'item_ore', qty: -5, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(0);
    expect(res.events[0]).toMatchObject({ type: 'ERROR', payload: { code: 'INVALID_QTY' } });
  });
});

describe('sellValue', () => {
  it('pays half value for small batches', () => {
    expect(sellValue(10, 1)).toBe(5);
    expect(sellValue(10, 20)).toBe(100);
  });

  it('pays less per item for big batches', () => {
    expect(sellValue(10, 100)).toBe(300); // 20 full + 80 at half
    expect(sellValue(10, 200)).toBe(425); // + 100 at a quarter
    expect(sellValue(1, 7200)).toBe(917);
  });

  it('always pays at least 1 gold for something with value', () => {
    expect(sellValue(1, 1)).toBe(1);
    expect(sellValue(1, 2)).toBe(1);
    expect(sellValue(0, 50)).toBe(0);
  });

  it('never pays less for more', () => {
    for (const value of [1, 2, 3, 7, 50, 999]) {
      for (let q = 1; q < 2000; q++) expect(sellValue(value, q + 1)).toBeGreaterThanOrEqual(sellValue(value, q));
    }
  });
});
