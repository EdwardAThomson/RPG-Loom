import type { GameEvent } from '@rpg-loom/shared';
import { activityLabel, enemyName, humanize, itemName, skillName } from './labels';

export type FeedTone = 'gain' | 'win' | 'loss' | 'quest' | 'muted' | 'normal';

export interface FeedEntry {
    id: string;
    /** Time of the most recent event folded into this entry. */
    atMs: number;
    tone: FeedTone;
    text: string;
    /** Secondary line, e.g. the flavour text that came with a gather tick. */
    detail?: string;
    /** How many ticks were folded into this entry. */
    count: number;
    /** Merge key; consecutive entries with the same key are combined. */
    key?: string;
    gains?: Gains;
}

interface Gains {
    items: Record<string, number>;
    skills: Record<string, number>;
    gold: number;
}

const GAIN_TYPES = new Set(['SKILL_XP_GAINED', 'GOLD_CHANGED', 'LOOT_GAINED']);
// XP_GAINED duplicates the per-skill gains; TICK_PROCESSED is bookkeeping.
const HIDDEN_TYPES = new Set(['TICK_PROCESSED', 'XP_GAINED']);

/**
 * Turn the raw engine fact stream into a readable log, newest first.
 *
 * Every gather or combat tick emits flavour text plus several gain
 * events. Showing them as-is buried anything interesting under two
 * lines per second, so a tick's gains become one entry, and runs of
 * identical ticks fold into a single "Wood ×12 · +12 Woodcutting XP".
 */
export function buildFeed(events: GameEvent[], content: any, limit = 40): FeedEntry[] {
    return appendFeed([], events, content, limit);
}

/**
 * Fold new events onto an existing feed (newest first) and return a new
 * feed. The log is kept this way, rather than rebuilt from a window of
 * recent raw events, because each tick emits ~5 events: a 50-event
 * window only covers ~10 seconds, so folded runs stopped growing and the
 * previous activity scrolled away almost as soon as you switched.
 *
 * Never mutates `feed`. A tick's events must arrive in the same call.
 */
export function appendFeed(feed: FeedEntry[], events: GameEvent[], content: any, limit = 40): FeedEntry[] {
    const out = feed.slice().reverse();
    const visible = events.filter(e => !HIDDEN_TYPES.has(e.type));

    let i = 0;
    while (i < visible.length) {
        const atMs = visible[i].atMs;
        const tick: GameEvent[] = [];
        while (i < visible.length && visible[i].atMs === atMs) tick.push(visible[i++]);

        const gains: Gains = { items: {}, skills: {}, gold: 0 };
        let hasGains = false;
        let flavor: string | undefined;

        // A sale's entry already says how much gold it fetched.
        const isSale = tick.some(ev => ev.type === 'ITEM_SOLD');

        for (const ev of tick) {
            if (isSale && ev.type === 'GOLD_CHANGED') continue;
            if (GAIN_TYPES.has(ev.type)) {
                hasGains = true;
                addGain(gains, ev);
            } else if (ev.type === 'FLAVOR_TEXT') {
                flavor = ev.payload.message;
            } else {
                push(out, single(ev, content), content);
            }
        }

        if (hasGains) {
            push(out, {
                id: tick[0].id,
                atMs,
                tone: 'gain',
                text: describeGains(gains, content),
                detail: flavor,
                count: 1,
                key: gainKey(gains),
                gains
            }, content);
        } else if (flavor) {
            push(out, { id: tick[0].id + '_f', atMs, tone: 'muted', text: flavor, count: 1, key: 'flavor:' + flavor }, content);
        }
    }

    return out.reverse().slice(0, limit);
}

function push(out: FeedEntry[], entry: FeedEntry, content: any) {
    const last = out[out.length - 1];
    if (last && entry.key && last.key === entry.key) {
        // Replace rather than mutate: `last` may belong to the previous feed.
        const merged: FeedEntry = {
            ...last,
            count: last.count + entry.count,
            atMs: entry.atMs,
            detail: entry.detail ?? last.detail
        };
        if (last.gains && entry.gains) {
            const gains: Gains = { items: { ...last.gains.items }, skills: { ...last.gains.skills }, gold: last.gains.gold + entry.gains.gold };
            for (const [k, v] of Object.entries(entry.gains.items)) gains.items[k] = (gains.items[k] ?? 0) + v;
            for (const [k, v] of Object.entries(entry.gains.skills)) gains.skills[k] = (gains.skills[k] ?? 0) + v;
            merged.gains = gains;
            merged.text = describeGains(gains, content);
        }
        out[out.length - 1] = merged;
        return;
    }
    out.push(entry);
}

function addGain(g: Gains, ev: GameEvent) {
    if (ev.type === 'SKILL_XP_GAINED') g.skills[ev.payload.skillId] = (g.skills[ev.payload.skillId] ?? 0) + ev.payload.amount;
    else if (ev.type === 'GOLD_CHANGED') g.gold += ev.payload.amount;
    else if (ev.type === 'LOOT_GAINED') for (const it of ev.payload.items) g.items[it.itemId] = (g.items[it.itemId] ?? 0) + it.qty;
}

function gainKey(g: Gains): string {
    return ['gain', Object.keys(g.items).sort().join(','), Object.keys(g.skills).sort().join(','), g.gold ? 'gold' : ''].join('|');
}

function describeGains(g: Gains, content: any): string {
    const parts: string[] = [];
    for (const [id, qty] of Object.entries(g.items)) parts.push(qty > 1 ? `${itemName(content, id)} ×${qty}` : itemName(content, id));
    if (g.gold) parts.push(`${g.gold > 0 ? '+' : ''}${g.gold} gold`);
    for (const [id, xp] of Object.entries(g.skills)) parts.push(`+${xp} ${skillName(id)} XP`);
    return parts.join(' · ');
}

function questName(content: any, templateId: string): string {
    return content?.questTemplatesById?.[templateId]?.name ?? 'a quest';
}

function single(ev: GameEvent, content: any): FeedEntry {
    const base = { id: ev.id, atMs: ev.atMs, count: 1 };
    switch (ev.type) {
        case 'ACTIVITY_SET': {
            const label = activityLabel(ev.payload.activity, content);
            return { ...base, tone: 'muted', text: ev.payload.activity.type === 'idle' ? 'Stopped' : `Started: ${label.toLowerCase()}` };
        }
        case 'ENCOUNTER_STARTED':
            return { ...base, tone: 'normal', text: `A ${enemyName(content, ev.payload.enemyId)} (Lv ${ev.payload.enemyLevel}) attacks` };
        case 'ENCOUNTER_RESOLVED': {
            const name = enemyName(content, ev.payload.enemyId);
            if (ev.payload.outcome === 'win') return { ...base, tone: 'win', text: `Defeated ${name}`, key: 'win:' + ev.payload.enemyId };
            if (ev.payload.outcome === 'escape') return { ...base, tone: 'muted', text: `Escaped from ${name}` };
            return { ...base, tone: 'loss', text: `Defeated by ${name}` };
        }
        case 'LEVEL_UP':
            return { ...base, tone: 'win', text: `Total level ${ev.payload.newLevel}` };
        case 'QUEST_ACCEPTED':
            return { ...base, tone: 'quest', text: `Quest accepted: ${questName(content, ev.payload.templateId)}` };
        case 'QUEST_PROGRESS':
            return { ...base, tone: 'quest', text: `Quest progress ${ev.payload.current}/${ev.payload.required}`, key: 'qp:' + ev.payload.questId };
        case 'QUEST_READY_FOR_TURN_IN':
            return { ...base, tone: 'quest', text: `Quest ready to hand in: ${questName(content, ev.payload.templateId)}` };
        case 'QUEST_COMPLETED':
            return { ...base, tone: 'win', text: `Quest complete: ${questName(content, ev.payload.templateId)}` };
        case 'TACTICS_CHANGED':
            return { ...base, tone: 'muted', text: `Stance: ${humanize(ev.payload.tactics).toLowerCase()}` };
        case 'ITEM_CONSUMED':
            return { ...base, tone: 'normal', text: ev.payload.healed ? `Used ${itemName(content, ev.payload.itemId)}: +${ev.payload.healed} HP` : `Used ${itemName(content, ev.payload.itemId)}` };
        case 'ITEM_SOLD':
            return { ...base, tone: 'gain', text: `Sold ${ev.payload.qty} ${itemName(content, ev.payload.itemId)} for ${ev.payload.gold} gold` };
        case 'SKILL_PROCS': {
            const effect = ev.payload.effect === 'double_yield' ? 'double yield!' : ev.payload.effect === 'material_save' ? 'materials saved' : humanize(ev.payload.effect).toLowerCase();
            return { ...base, tone: 'normal', text: `${skillName(ev.payload.skillId)}: ${effect}`, key: 'proc:' + ev.payload.skillId + ev.payload.effect };
        }
        case 'NPC_INTERACTED': {
            const name = content?.npcsById?.[ev.payload.npcId]?.name ?? humanize(ev.payload.npcId);
            return { ...base, tone: 'normal', text: ev.payload.firstMeet ? `Met ${name}` : `Spoke with ${name}` };
        }
        case 'ERROR':
            return ev.payload.code === 'INSUFFICIENT_GOLD'
                ? { ...base, tone: 'muted', text: `Stopped: ${ev.payload.message}` }
                : { ...base, tone: 'loss', text: ev.payload.message };
        default:
            return { ...base, tone: 'muted', text: humanize((ev as GameEvent).type) };
    }
}
