import { describe, it, expect } from 'vitest';
import { createNewState, step, applyCommand } from '../engine.js';
import { hashFloat } from '../rng.js';
import content from '@rpg-loom/content';
import type { EngineState } from '@rpg-loom/shared';

const C = content as any;

const INIT = { saveId: 'save_mech', playerId: 'p', playerName: 'Hero', nowMs: 1_000_000, startLocationId: 'loc_forest' };

// A single enemy that never crits and never gets extra strikes unless
// a test sets it up, so the damage numbers below are deterministic.
function arena(enemy: Partial<any>) {
    const e = {
        id: 'enemy_dummy',
        name: 'Dummy',
        tags: [],
        levelMin: 1,
        levelMax: 1,
        baseStats: { hpMax: 1000, atk: 20, def: 0, spd: 0, critChance: 0, critMult: 1, res: 0 },
        lootTable: { entries: [] },
        ...enemy
    };
    return {
        ...C,
        enemiesById: { ...C.enemiesById, enemy_dummy: e },
        locationsById: {
            ...C.locationsById,
            loc_arena: { id: 'loc_arena', name: 'Arena', description: '', activities: ['hunt'], encounterTable: { entries: [{ enemyId: 'enemy_dummy', weight: 1 }] } }
        }
    };
}

function hunting(state: EngineState, atMs: number): EngineState {
    state.currentLocationId = 'loc_arena';
    state.activity = { id: 'act_hunt', params: { type: 'hunt', locationId: 'loc_arena' }, startedAtMs: atMs };
    return state;
}

/** Runs the encounter-start tick plus one exchange and returns the HP each side lost. */
function oneExchange(state: EngineState, cnt: any) {
    const startHp = state.player.baseStats.hp;
    const r = step(state, state.lastTickAtMs + 2000, cnt);
    const enemyLost = r.state.activeEncounter ? r.state.activeEncounter.enemyMaxHp - r.state.activeEncounter.enemyHp : NaN;
    return { playerLost: startHp - r.state.player.baseStats.hp, enemyLost, res: r };
}

describe('Consumables', () => {
    it('a potion restores HP by its modifiers.hp and is removed', () => {
        let state = createNewState(INIT);
        state.player.baseStats.hp = 1;
        state = applyCommand(state, { type: 'DEBUG_ADD_ITEM', itemId: 'item_simple_potion', qty: 2, atMs: 1 }, C).state;
        const r = applyCommand(state, { type: 'USE_ITEM', itemId: 'item_simple_potion', atMs: 2 }, C);
        expect(r.state.player.baseStats.hp).toBe(11);
        expect(r.state.inventory.find(s => s.itemId === 'item_simple_potion')?.qty).toBe(1);
        const consumed = r.events.find(e => e.type === 'ITEM_CONSUMED');
        expect((consumed?.payload as any).healed).toBe(10);
    });

    it('healing never exceeds hpMax', () => {
        let state = createNewState(INIT);
        const max = state.player.baseStats.hpMax;
        state.player.baseStats.hp = max - 3;
        state = applyCommand(state, { type: 'DEBUG_ADD_ITEM', itemId: 'item_simple_potion', qty: 1, atMs: 1 }, C).state;
        const r = applyCommand(state, { type: 'USE_ITEM', itemId: 'item_simple_potion', atMs: 2 }, C);
        expect(r.state.player.baseStats.hp).toBe(max);
        expect((r.events[0].payload as any).healed).toBe(3);
    });

    it('refuses to "use" gear instead of silently deleting it', () => {
        let state = createNewState(INIT);
        state = applyCommand(state, { type: 'DEBUG_ADD_ITEM', itemId: 'item_iron_sword', qty: 1, atMs: 1 }, C).state;
        const r = applyCommand(state, { type: 'USE_ITEM', itemId: 'item_iron_sword', atMs: 2 }, C);
        expect(r.events[0].type).toBe('ERROR');
        expect(r.state.inventory.find(s => s.itemId === 'item_iron_sword')?.qty).toBe(1);
    });
});

describe('Tactics', () => {
    const takenWith = (tactics: 'balanced' | 'defensive' | 'aggressive') => {
        const cnt = arena({});
        let state = hunting(createNewState(INIT), INIT.nowMs);
        state.player.tactics = tactics;
        return oneExchange(state, cnt).playerLost;
    };

    it('Defensive reduces damage taken and Aggressive increases it', () => {
        const balanced = takenWith('balanced');
        expect(balanced).toBeGreaterThan(0);
        expect(takenWith('defensive')).toBeLessThan(balanced);
        expect(takenWith('aggressive')).toBeGreaterThan(balanced);
    });
});

describe('Crit, speed and resistance', () => {
    it('a guaranteed critical multiplies the player damage by critMult', () => {
        const cnt = arena({});
        const base = hunting(createNewState(INIT), INIT.nowMs);
        const normal = oneExchange(base, cnt).enemyLost;

        const critter = hunting(createNewState(INIT), INIT.nowMs);
        critter.player.intrinsicStats = { ...critter.player.intrinsicStats!, critChance: 1, critMult: 2 };
        critter.player.baseStats = { ...critter.player.baseStats, critChance: 1, critMult: 2 };
        const r = oneExchange(critter, cnt);
        expect(r.enemyLost).toBe(normal * 2);
        expect(r.res.events.some(e => e.type === 'FLAVOR_TEXT' && /Critical hit/.test((e.payload as any).message))).toBe(true);
    });

    it('enemy crits land on the player', () => {
        // Low attack so a crit can't knock a fresh character out (HP floors at 1).
        const calm = oneExchange(hunting(createNewState(INIT), INIT.nowMs), arena({ baseStats: { hpMax: 1000, atk: 6, def: 0, spd: 0, critChance: 0, critMult: 1, res: 0 } })).playerLost;
        const spiky = oneExchange(hunting(createNewState(INIT), INIT.nowMs), arena({ baseStats: { hpMax: 1000, atk: 6, def: 0, spd: 0, critChance: 1, critMult: 2, res: 0 } })).playerLost;
        // Regen and floor rounding blur the exact 2x; a crit is still unmistakable.
        expect(spiky).toBeGreaterThan(calm * 1.5);
    });

    it('a large speed advantage grants a second strike some of the time', () => {
        const cnt = arena({});
        let doubles = 0;
        for (let i = 0; i < 40; i++) {
            const state = hunting(createNewState({ ...INIT, saveId: `spd_${i}` }), INIT.nowMs);
            state.player.baseStats.spd = 100;
            const r = oneExchange(state, cnt);
            if (r.res.events.some(e => e.type === 'FLAVOR_TEXT' && /strike 2 times/.test((e.payload as any).message))) doubles++;
        }
        // 50% cap; well inside [10, 30] across 40 seeded rolls.
        expect(doubles).toBeGreaterThan(8);
        expect(doubles).toBeLessThan(32);
        // and never with equal speed
        const slow = hunting(createNewState(INIT), INIT.nowMs);
        expect(oneExchange(slow, cnt).res.events.some(e => /strike 2 times/.test(String((e.payload as any).message ?? '')))).toBe(false);
    });

    it('staff wielders deal magic damage: resisted by res, not def', () => {
        const armoured = arena({ baseStats: { hpMax: 1000, atk: 1, def: 200, spd: 0, critChance: 0, critMult: 1, res: 0 } });
        const sword = hunting(createNewState(INIT), INIT.nowMs);
        const swordDmg = oneExchange(sword, armoured).enemyLost;

        let mage = hunting(createNewState(INIT), INIT.nowMs);
        mage = applyCommand(mage, { type: 'DEBUG_ADD_ITEM', itemId: 'item_apprentice_staff', qty: 1, atMs: 1 }, armoured).state;
        mage = applyCommand(mage, { type: 'EQUIP_ITEM', itemId: 'item_apprentice_staff', slot: 'weapon', atMs: 2 }, armoured).state;
        mage = hunting(mage, INIT.nowMs);
        const staffDmg = oneExchange(mage, armoured).enemyLost;
        expect(staffDmg).toBeGreaterThan(swordDmg);

        const warded = arena({ baseStats: { hpMax: 1000, atk: 1, def: 0, spd: 0, critChance: 0, critMult: 1, res: 0.8 } });
        const staffVsWard = oneExchange(hunting(mage, INIT.nowMs), warded).enemyLost;
        expect(staffVsWard).toBeLessThan(staffDmg);
    });

    it('magic-type enemies are resisted by the player res, not def', () => {
        const caster = { baseStats: { hpMax: 1000, atk: 20, def: 0, spd: 0, critChance: 0, critMult: 1, res: 0 }, damageType: 'magic' };
        const tank = hunting(createNewState(INIT), INIT.nowMs);
        tank.player.baseStats.def = 500;
        const vsPhysical = oneExchange(tank, arena({ baseStats: caster.baseStats })).playerLost;
        const vsMagic = oneExchange(hunting(createNewState(INIT), INIT.nowMs), arena(caster)).playerLost;
        expect(vsMagic).toBeGreaterThan(vsPhysical);
        const robed = hunting(createNewState(INIT), INIT.nowMs);
        robed.player.baseStats.res = 0.5;
        expect(oneExchange(robed, arena(caster)).playerLost).toBeLessThan(vsMagic);
    });

    it('res and critMult on equipment are summed into stats', () => {
        let state = createNewState(INIT);
        state = applyCommand(state, { type: 'DEBUG_ADD_ITEM', itemId: 'item_crystal_robes', qty: 1, atMs: 1 }, C).state;
        state = applyCommand(state, { type: 'EQUIP_ITEM', itemId: 'item_crystal_robes', slot: 'armor', atMs: 2 }, C).state;
        expect(state.player.baseStats.res).toBeCloseTo(0.05 + 0.3);
    });
});

describe('Loot', () => {
    it('noDropWeight makes some kills drop nothing', () => {
        // Skeleton: bone 6, iron sword 1, nothing 6. Over 200 seeded kills
        // the sword should be rare and empty rolls common.
        let swords = 0, empty = 0;
        for (let i = 0; i < 200; i++) {
            const cnt = { ...C, locationsById: { ...C.locationsById, loc_arena: { id: 'loc_arena', name: 'A', description: '', activities: ['hunt'], encounterTable: { entries: [{ enemyId: 'enemy_skeleton', weight: 1 }] } } } };
            let state = hunting(createNewState({ ...INIT, saveId: `loot_${i}` }), INIT.nowMs);
            state.player.baseStats.atk = 100000;
            state.player.baseStats.hpMax = state.player.baseStats.hp = 100000;
            const r = step(state, INIT.nowMs + 2000, cnt);
            expect(r.events.some(e => e.type === 'ENCOUNTER_RESOLVED' && (e.payload as any).outcome === 'win')).toBe(true);
            const loot = r.events.find(e => e.type === 'LOOT_GAINED');
            if (!loot) empty++;
            else if ((loot.payload as any).items.some((x: any) => x.itemId === 'item_iron_sword')) swords++;
        }
        expect(empty).toBeGreaterThan(50);
        expect(swords).toBeLessThan(40);
    });

    it('tables without noDropWeight still always drop', () => {
        const woodTicks = step(applyCommand(createNewState(INIT), { type: 'SET_ACTIVITY', params: { type: 'woodcut', locationId: 'loc_forest' }, atMs: INIT.nowMs }, C).state, INIT.nowMs + 10_000, C);
        expect(woodTicks.events.filter(e => e.type === 'LOOT_GAINED').length).toBe(10);
    });
});

describe('Gathering scales with skill and tools', () => {
    const gatherFor = (state: EngineState, type: 'mine' | 'woodcut', ticks: number) => {
        const s = applyCommand(state, { type: 'SET_ACTIVITY', params: { type, locationId: 'loc_forest' }, atMs: INIT.nowMs }, C).state;
        return step(s, INIT.nowMs + ticks * 1000, C).events.filter(e => e.type === 'LOOT_GAINED').reduce((n, e) => n + (e.payload as any).items[0].qty, 0);
    };

    it('a high gathering skill doubles the haul some of the time', () => {
        const novice = gatherFor(createNewState(INIT), 'woodcut', 100);
        const master = createNewState(INIT);
        master.player.skills.woodcutting.level = 51; // 50% double chance
        const expert = gatherFor(master, 'woodcut', 100);
        expect(expert).toBeGreaterThan(novice * 1.2);
        // never silently: the proc is an event the feed can show
        const s = applyCommand(master, { type: 'SET_ACTIVITY', params: { type: 'woodcut', locationId: 'loc_forest' }, atMs: INIT.nowMs }, C).state;
        expect(step(s, INIT.nowMs + 100_000, C).events.some(e => e.type === 'SKILL_PROCS' && (e.payload as any).effect === 'double_yield')).toBe(true);
    });

    it('an equipped pickaxe adds its gatherBonus per mining tick', () => {
        const bare = gatherFor(createNewState(INIT), 'mine', 20);
        let state = applyCommand(createNewState(INIT), { type: 'DEBUG_ADD_ITEM', itemId: 'item_iron_pickaxe', qty: 1, atMs: 1 }, C).state;
        state = applyCommand(state, { type: 'EQUIP_ITEM', itemId: 'item_iron_pickaxe', slot: 'accessory1', atMs: 2 }, C).state;
        expect(gatherFor(state, 'mine', 20)).toBe(bare + 20 * 2);
        // the pickaxe is a mining tool: woodcutting is unaffected
        expect(gatherFor(state, 'woodcut', 20)).toBe(gatherFor(createNewState(INIT), 'woodcut', 20));
    });
});

describe('Determinism of the new rolls', () => {
    it('the same seed produces the same combat', () => {
        const cnt = arena({ baseStats: { hpMax: 1000, atk: 20, def: 0, spd: 30, critChance: 0.5, critMult: 2, res: 0 } });
        const a = step(hunting(createNewState(INIT), INIT.nowMs), INIT.nowMs + 30_000, cnt);
        const b = step(hunting(createNewState(INIT), INIT.nowMs), INIT.nowMs + 30_000, cnt);
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
        expect(hashFloat('x')).toBe(hashFloat('x'));
    });
});
