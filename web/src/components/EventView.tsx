import React, { useRef, useEffect } from 'react';
import { GameEvent } from '@rpg-loom/shared';

interface Props {
    events: GameEvent[];
    content: any;
}

type DisplayEvent = GameEvent | {
    id: string;
    atMs: number;
    type: 'SUMMARY';
    payload: { parts: string[] };
};

// Helper to format event summary parts
function formatEvent(ev: any, content: any) {
    if (ev.type === 'XP_GAINED') return `+${ev.payload.amount} XP`;
    if (ev.type === 'SKILL_XP_GAINED') {
        // Map internal skill IDs to display names
        const skillNames: Record<string, string> = {
            blacksmithing: 'Smithing',
            woodworking: 'Woodworking',
            leatherworking: 'Leatherworking',
            swordsmanship: 'Swordsmanship',
            marksmanship: 'Marksmanship',
            arcana: 'Arcana',
            defense: 'Defense',
            mining: 'Mining',
            woodcutting: 'Woodcutting',
            foraging: 'Foraging'
        };
        const skillName = skillNames[ev.payload.skillId] || ev.payload.skillId;
        return `+${ev.payload.amount} ${skillName} XP`;
    }
    if (ev.type === 'GOLD_CHANGED') return `+${ev.payload.amount} Gold`;
    if (ev.type === 'LOOT_GAINED') {
        const itemNames = ev.payload.items.map((i: any) => {
            const name = content?.itemsById?.[i.itemId]?.name;
            return name || i.itemId.replace('item_', '');
        });
        return `Loot: ${itemNames.join(', ')}`;
    }
    if (ev.type === 'QUEST_PROGRESS') {
        // Find quest to get item/enemy name
        const gained = ev.payload.gained;
        const current = ev.payload.current;
        const required = ev.payload.required;
        return `Quest Progress: +${gained} (${current}/${required})`;
    }
    if (ev.type === 'ENCOUNTER_RESOLVED') {
        const enemyName = content?.enemiesById?.[ev.payload.enemyId]?.name || ev.payload.enemyId;
        return `${ev.payload.outcome === 'win' ? 'Defeated' : 'Lost to'} ${enemyName}`;
    }
    if (ev.type === 'FLAVOR_TEXT') return ev.payload.message;
    if (ev.type === 'ERROR') {
        if (ev.payload.code === 'INSUFFICIENT_GOLD') return `Stopped: ${ev.payload.message}`;
        return `Error: ${ev.payload.message}`;
    }
    return ev.type;
}

export function EventView({ events, content }: Props) {
    // Auto-scroll could go here if needed, but flex-col-reverse handles the "bottom" pinning nicely.

    return (
        <section className="card" style={{ height: '100%', overflow: 'hidden' }}>
            <h2>Event Log</h2>
            <div className="event-log" style={{ height: '100%' }}>
                {(() => {
                    const aggregatedEvents: DisplayEvent[] = [];
                    const sourceEvents = events.slice()
                        .filter((ev: any) => ev.type !== 'TICK_PROCESSED')
                        .reverse()
                        .slice(0, 50);

                    for (let i = 0; i < sourceEvents.length; i++) {
                        const ev = sourceEvents[i];
                        if (aggregatedEvents.length > 0) {
                            const last = aggregatedEvents[aggregatedEvents.length - 1];

                            // Check if mergeable
                            if (last.atMs === ev.atMs &&
                                (ev.type === 'XP_GAINED' || ev.type === 'SKILL_XP_GAINED' || ev.type === 'GOLD_CHANGED' || ev.type === 'LOOT_GAINED' || ev.type === 'QUEST_PROGRESS') &&
                                (last.type === 'XP_GAINED' || last.type === 'SKILL_XP_GAINED' || last.type === 'GOLD_CHANGED' || last.type === 'LOOT_GAINED' || last.type === 'QUEST_PROGRESS' || last.type === 'ENCOUNTER_RESOLVED' || last.type === 'SUMMARY')) {

                                if (last.type !== 'SUMMARY') {
                                    // Upgrade valid previous event to SUMMARY
                                    const newSummary: DisplayEvent = {
                                        id: last.id + '_sum',
                                        atMs: last.atMs,
                                        type: 'SUMMARY',
                                        payload: { parts: [formatEvent(last, content)] }
                                    };
                                    aggregatedEvents[aggregatedEvents.length - 1] = newSummary;
                                    newSummary.payload.parts.push(formatEvent(ev, content));
                                } else {
                                    // Already a summary, push new part
                                    last.payload.parts.push(formatEvent(ev, content));
                                }
                                continue;
                            }
                        }
                        aggregatedEvents.push(ev);
                    }

                    return aggregatedEvents.map(ev => {
                        if (ev.type === 'SUMMARY') {
                            return (
                                <div key={ev.id} className="event-entry summary">
                                    <span className="time">{new Date(ev.atMs).toLocaleTimeString([], { hour12: false })}</span>
                                    <span className="content">
                                        {ev.payload.parts.join(', ')}
                                    </span>
                                </div>
                            );
                        }
                        // Determine style class based on event type
                        let typeClass = '';
                        if (ev.type === 'ENCOUNTER_RESOLVED') {
                            typeClass = (ev.payload as any).outcome === 'win' ? 'win' : 'loss';
                        } else if (ev.type === 'ERROR') {
                            // Special styling for non-critical errors
                            if ((ev.payload as any).code === 'INSUFFICIENT_GOLD') typeClass = 'summary'; // Use neutral color
                            else typeClass = 'loss';
                        }

                        return (
                            <div key={ev.id} className={`event-entry ${typeClass}`}>
                                <span className="time">{new Date(ev.atMs).toLocaleTimeString([], { hour12: false })}</span>
                                <span className="content">
                                    {formatEvent(ev, content)}
                                </span>
                            </div>
                        );
                    });
                })()}
            </div>
        </section>
    );
}
