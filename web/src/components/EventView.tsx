import React, { useRef, useEffect } from 'react';
import { GameEvent } from '@rpg-loom/shared';

interface Props {
    events: GameEvent[];
}

type DisplayEvent = GameEvent | {
    id: string;
    atMs: number;
    type: 'SUMMARY';
    payload: { parts: string[] };
};

// Helper to format event summary parts
function formatEvent(ev: any) {
    if (ev.type === 'XP_GAINED') return `+${ev.payload.amount} XP`;
    if (ev.type === 'GOLD_CHANGED') return `+${ev.payload.amount} Gold`;
    if (ev.type === 'LOOT_GAINED') return `Loot: ${ev.payload.items.map((i: any) => i.itemId.replace('item_', '')).join(', ')}`;
    if (ev.type === 'ENCOUNTER_RESOLVED') return `${ev.payload.outcome === 'win' ? 'Defeated' : 'Lost to'} ${ev.payload.enemyId}`;
    if (ev.type === 'FLAVOR_TEXT') return ev.payload.message;
    if (ev.type === 'ERROR') {
        if (ev.payload.code === 'INSUFFICIENT_GOLD') return `Stopped: ${ev.payload.message}`;
        return `Error: ${ev.payload.message}`;
    }
    return ev.type;
}

export function EventView({ events }: Props) {
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
                                (ev.type === 'XP_GAINED' || ev.type === 'GOLD_CHANGED' || ev.type === 'LOOT_GAINED') &&
                                (last.type === 'XP_GAINED' || last.type === 'GOLD_CHANGED' || last.type === 'LOOT_GAINED' || last.type === 'ENCOUNTER_RESOLVED' || last.type === 'SUMMARY')) {

                                if (last.type !== 'SUMMARY') {
                                    // Upgrade valid previous event to SUMMARY
                                    const newSummary: DisplayEvent = {
                                        id: last.id + '_sum',
                                        atMs: last.atMs,
                                        type: 'SUMMARY',
                                        payload: { parts: [formatEvent(last)] }
                                    };
                                    aggregatedEvents[aggregatedEvents.length - 1] = newSummary;
                                    newSummary.payload.parts.push(formatEvent(ev));
                                } else {
                                    // Already a summary, push new part
                                    last.payload.parts.push(formatEvent(ev));
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
                                    {formatEvent(ev)}
                                </span>
                            </div>
                        );
                    });
                })()}
            </div>
        </section>
    );
}
