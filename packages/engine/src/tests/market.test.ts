import { describe, it, expect } from 'vitest';
import { applyCommand, createNewState } from '../engine';

const content: any = {
  itemsById: {
    item_ore: { id: 'item_ore', name: 'Ore', type: 'material', value: 10 },
    item_wood: { id: 'item_wood', name: 'Wood', type: 'resource', value: 1 }
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

  it('prices the whole batch, so cheap items still sell in bulk', () => {
    const state = withOre(0);
    state.inventory = [{ itemId: 'item_wood', qty: 37 }];
    const res = applyCommand(state, { type: 'SELL_ITEM', itemId: 'item_wood', qty: 37, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(18);
    expect(res.state.inventory).toEqual([]);
  });

  it('refuses a sale that would pay nothing and keeps the item', () => {
    const state = withOre(0);
    state.inventory = [{ itemId: 'item_wood', qty: 5 }];
    const res = applyCommand(state, { type: 'SELL_ITEM', itemId: 'item_wood', qty: 1, atMs: 2000 }, content);
    expect(res.state.player.gold).toBe(0);
    expect(res.state.inventory).toEqual([{ itemId: 'item_wood', qty: 5 }]);
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
