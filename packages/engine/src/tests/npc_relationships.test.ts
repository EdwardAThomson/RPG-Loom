import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createNewState,
  getAffinityTier,
  nextAffinityTier,
  getMarketDiscount,
  getQuestsOfferedByNpc,
  getLockedQuestsFromNpc,
  pickNpcLine
} from '../engine.js';
import content from '@rpg-loom/content';
import type { EngineState } from '@rpg-loom/shared';

const C = content as any;
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_000_000;

function haven(): EngineState {
  return createNewState({ saveId: 'npc_rel', playerId: 'p', playerName: 'Hero', nowMs: T0, startLocationId: 'loc_haven' });
}
function withItem(state: EngineState, itemId: string, qty = 1) {
  return applyCommand(state, { type: 'DEBUG_ADD_ITEM', itemId, qty, atMs: T0 }, C).state;
}
function withAffinity(state: EngineState, npcId: string, affinity: number) {
  state.npcState[npcId] = { affinity, firstMetAtMs: T0, lastInteractionMs: T0 };
  return state;
}

describe('Talking is worth affinity once a day', () => {
  it('the second talk in a day keeps lastInteractionMs but gains nothing', () => {
    let state = applyCommand(haven(), { type: 'TALK_TO_NPC', npcId: 'npc_aldric', atMs: T0 }, C).state;
    const r = applyCommand(state, { type: 'TALK_TO_NPC', npcId: 'npc_aldric', atMs: T0 + 60_000 }, C);
    expect(r.state.npcState.npc_aldric.affinity).toBe(1);
    expect(r.state.npcState.npc_aldric.lastInteractionMs).toBe(T0 + 60_000);
    expect((r.events[0].payload as any).affinityGained).toBe(0);
    const next = applyCommand(r.state, { type: 'TALK_TO_NPC', npcId: 'npc_aldric', atMs: T0 + DAY }, C);
    expect(next.state.npcState.npc_aldric.affinity).toBe(2);
    expect((next.events[0].payload as any).affinityGained).toBe(1);
  });
});

describe('Gifts', () => {
  it('a liked gift is worth more than a polite one, and consumes the item', () => {
    let state = withItem(withItem(haven(), 'item_plank'), 'item_slime_gel');
    const liked = applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_aldric', itemId: 'item_plank', atMs: T0 }, C);
    expect(liked.events[0].type).toBe('NPC_GIFTED');
    expect((liked.events[0].payload as any).liked).toBe(true);
    expect(liked.state.npcState.npc_aldric.affinity).toBe(4);
    expect(liked.state.inventory.find(s => s.itemId === 'item_plank')).toBeUndefined();

    const meh = applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_aldric', itemId: 'item_slime_gel', atMs: T0 }, C);
    expect((meh.events[0].payload as any).liked).toBe(false);
    expect(meh.state.npcState.npc_aldric.affinity).toBe(1);
  });

  it('likes match item tags as well as ids', () => {
    const state = withItem(haven(), 'item_hunting_bow');
    const r = applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_mira', itemId: 'item_hunting_bow', atMs: T0 }, C);
    expect((r.events[0].payload as any).liked).toBe(true);
  });

  it('one gift per NPC per day; refused gifts stay in the pack', () => {
    let state = withItem(haven(), 'item_plank', 2);
    state = applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_aldric', itemId: 'item_plank', atMs: T0 }, C).state;
    const again = applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_aldric', itemId: 'item_plank', atMs: T0 + 1000 }, C);
    expect(again.events[0].type).toBe('ERROR');
    expect((again.events[0].payload as any).code).toBe('GIFT_TOO_SOON');
    expect(again.state.inventory.find(s => s.itemId === 'item_plank')?.qty).toBe(1);
    const tomorrow = applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_aldric', itemId: 'item_plank', atMs: T0 + DAY }, C);
    expect(tomorrow.events[0].type).toBe('NPC_GIFTED');
  });

  it('cannot gift an NPC who is elsewhere, or an item you lack', () => {
    const state = withItem(haven(), 'item_plank');
    expect((applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_brokk', itemId: 'item_plank', atMs: T0 }, C).events[0].payload as any).code).toBe('NPC_NOT_HERE');
    expect((applyCommand(state, { type: 'GIVE_GIFT', npcId: 'npc_aldric', itemId: 'item_iron_sword', atMs: T0 }, C).events[0].payload as any).code).toBe('ITEM_NOT_OWNED');
  });
});

describe('Tiers and what they buy', () => {
  it('tier thresholds', () => {
    expect(getAffinityTier(0)).toBe('stranger');
    expect(getAffinityTier(10)).toBe('known');
    expect(getAffinityTier(30)).toBe('friend');
    expect(getAffinityTier(60)).toBe('trusted');
    expect(nextAffinityTier(12)).toEqual({ tier: 'friend', at: 30 });
    expect(nextAffinityTier(99)).toBeNull();
  });

  it('a friend at the market lowers buy prices', () => {
    const stranger = haven();
    expect(getMarketDiscount(stranger, C)).toBe(0);
    const befriended = withAffinity(haven(), 'npc_tovan', 35);
    expect(getMarketDiscount(befriended, C)).toBe(0.1);
    // Friends elsewhere don't help here.
    expect(getMarketDiscount(withAffinity(haven(), 'npc_brokk', 80), C)).toBe(0);

    const potion = C.itemsById.item_simple_potion.value;
    befriended.player.gold = potion;
    const r = applyCommand(befriended, { type: 'BUY_ITEM', itemId: 'item_simple_potion', qty: 1, atMs: T0 }, C);
    expect(r.state.player.gold).toBe(potion - Math.round(potion * 0.9));
  });

  it('personal quests unlock at minAffinity and show as locked until then', () => {
    const cold = haven();
    expect(getQuestsOfferedByNpc(cold, C, 'npc_aldric', T0).map(t => t.id)).not.toContain('qt_aldric_road_1');
    expect(getLockedQuestsFromNpc(cold, C, 'npc_aldric')[0]?.id).toBe('qt_aldric_road_1');
    const warm = withAffinity(haven(), 'npc_aldric', 30);
    expect(getQuestsOfferedByNpc(warm, C, 'npc_aldric', T0).map(t => t.id)).toContain('qt_aldric_road_1');
    // later chain steps wait on the earlier ones even once trusted
    expect(getQuestsOfferedByNpc(warm, C, 'npc_aldric', T0).map(t => t.id)).not.toContain('qt_aldric_road_2');
  });
});

describe('pickNpcLine', () => {
  const aldric = C.npcsById.npc_aldric;

  it('a stranger hears a first-meeting line; a known face hears small talk for their tier', () => {
    expect(aldric.dialogue.firstMeet).toContain(pickNpcLine(aldric, haven()).text);
    const known = withAffinity(haven(), 'npc_aldric', 15);
    expect(aldric.dialogue.idle.known).toContain(pickNpcLine(aldric, known).text);
  });

  it('quest state outranks small talk', () => {
    let state = withAffinity(haven(), 'npc_aldric', 15);
    state = applyCommand(state, { type: 'ACCEPT_QUEST', templateId: 'qt_intro_gather', atMs: T0 }, C).state;
    expect(pickNpcLine(aldric, state).kind).toBe('questActive');
    const q = state.quests[0];
    q.progress.current = q.progress.required;
    q.status = 'ready_to_turn_in';
    expect(pickNpcLine(aldric, state).kind).toBe('questTurnIn');
  });

  it('a per-quest completion line wins over the generic turn-in pool', () => {
    let state = withAffinity(haven(), 'npc_aldric', 80);
    state.questAvailability.aldric_road = { chainProgress: 2 } as any;
    state = applyCommand(state, { type: 'ACCEPT_QUEST', templateId: 'qt_aldric_road_3', atMs: T0 }, C).state;
    const q = state.quests[0];
    q.progress.current = q.progress.required;
    q.status = 'ready_to_turn_in';
    expect(pickNpcLine(aldric, state).text).toBe(aldric.dialogue.questComplete.qt_aldric_road_3);
  });

  it('is deterministic until the player talks again', () => {
    const state = withAffinity(haven(), 'npc_aldric', 15);
    const a = pickNpcLine(aldric, state, T0).text;
    expect(pickNpcLine(aldric, state, T0 + 5000).text).toBe(a);
  });

  it('falls back to the greeting for an NPC with no pools', () => {
    const bare = { ...aldric, dialogue: undefined };
    expect(pickNpcLine(bare, haven()).text).toBe(aldric.prompts.greeting);
  });
});

describe('NPC content', () => {
    const items = Object.keys(C.itemsById) as string[];

    it('likes and per-quest lines reference real items, tags and quest templates', () => {
        const tags = new Set(items.flatMap(id => C.itemsById[id].tags ?? []));
        const bad: string[] = [];
        for (const n of Object.values(C.npcsById) as any[]) {
            for (const l of n.likes ?? []) if (!C.itemsById[l] && !tags.has(l)) bad.push(`${n.id} likes ${l}`);
            for (const k of Object.keys(n.dialogue?.questOffer ?? {})) if (C.questTemplatesById[k]?.questGiverNpcId !== n.id) bad.push(`${n.id} questOffer ${k}`);
            for (const k of Object.keys(n.dialogue?.questComplete ?? {})) if (C.questTemplatesById[k]?.questGiverNpcId !== n.id) bad.push(`${n.id} questComplete ${k}`);
        }
        expect(bad).toEqual([]);
    });

    it('every NPC has a voice for each situation', () => {
        for (const n of Object.values(C.npcsById) as any[]) {
            const d = n.dialogue ?? {};
            expect(d.firstMeet?.length, `${n.id} firstMeet`).toBeGreaterThan(0);
            for (const tier of ['stranger', 'known', 'friend', 'trusted']) expect(d.idle?.[tier]?.length, `${n.id} idle.${tier}`).toBeGreaterThan(0);
            expect(d.questActive?.length, `${n.id} questActive`).toBeGreaterThan(0);
            expect(d.questTurnIn?.length, `${n.id} questTurnIn`).toBeGreaterThan(0);
            expect(d.giftLiked?.length, `${n.id} giftLiked`).toBeGreaterThan(0);
            expect(d.giftMeh?.length, `${n.id} giftMeh`).toBeGreaterThan(0);
            expect(n.likes?.length, `${n.id} likes`).toBeGreaterThan(0);
        }
    });

    it('personal chains have a giver, a threshold and consecutive steps', () => {
        const chains: Record<string, number[]> = {};
        for (const t of Object.values(C.questTemplatesById) as any[]) {
            if (!t.minAffinity) continue;
            expect(t.questGiverNpcId, t.id).toBeTruthy();
            expect(t.replenishment?.type, t.id).toBe('chain');
            (chains[t.replenishment.chainId] ??= []).push(t.replenishment.chainStep);
        }
        for (const [id, steps] of Object.entries(chains)) expect(steps.sort(), id).toEqual(steps.map((_, i) => i + 1));
    });
});
