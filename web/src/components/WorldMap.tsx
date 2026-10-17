import type { LocationDef } from '@rpg-loom/shared';

export interface MapStop {
    loc: LocationDef;
    x: number;
    y: number;
    locked: boolean;
    current: boolean;
}

interface Props {
    stops: MapStop[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

const W = 100;
const H = 60;
const R = 4.2;

/** Smooth path through the stops in order (Catmull-Rom → cubic Bézier). */
function routePath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

/**
 * Stylised route map: the locations in progression order joined by a
 * winding trail, each drawn as a round cut of its own painting. Locked
 * stops are dimmed and the trail beyond the last unlocked stop is dashed.
 */
export function WorldMap({ stops, selectedId, onSelect }: Props) {
    const lastOpen = stops.reduce((acc, s, i) => (s.locked ? acc : i), 0);
    const openPath = routePath(stops.slice(0, lastOpen + 1));
    const lockedPath = routePath(stops.slice(Math.max(0, lastOpen)));

    return (
        <svg
            className="world-map"
            viewBox={`0 0 ${W} ${H}`}
            role="group"
            aria-label="World map"
            preserveAspectRatio="xMidYMid meet"
        >
            <defs>
                {stops.map(s => (
                    <clipPath key={s.loc.id} id={`clip-${s.loc.id}`}>
                        <circle cx={s.x} cy={s.y} r={R} />
                    </clipPath>
                ))}
            </defs>

            <path className="route" d={openPath} />
            <path className="route route-locked" d={lockedPath} />

            {stops.map(s => {
                const cls = ['stop', s.locked && 'is-locked', s.current && 'is-current', s.loc.id === selectedId && 'is-selected']
                    .filter(Boolean).join(' ');
                const minLevel = s.loc.requirements?.minLevel;
                return (
                    <g
                        key={s.loc.id}
                        className={cls}
                        tabIndex={0}
                        role="button"
                        aria-label={`${s.loc.name}${s.locked ? ', locked' : ''}${s.current ? ', you are here' : ''}`}
                        aria-pressed={s.loc.id === selectedId}
                        onClick={() => onSelect(s.loc.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.loc.id); } }}
                    >
                        <circle className="halo" cx={s.x} cy={s.y} r={R + 1.6} />
                        {s.loc.image ? (
                            <image
                                href={s.loc.image}
                                x={s.x - R}
                                y={s.y - R}
                                width={R * 2}
                                height={R * 2}
                                preserveAspectRatio="xMidYMid slice"
                                clipPath={`url(#clip-${s.loc.id})`}
                            />
                        ) : (
                            <circle className="fill" cx={s.x} cy={s.y} r={R} />
                        )}
                        <circle className="ring" cx={s.x} cy={s.y} r={R} />
                        <text className="label" x={s.x} y={s.y + R + 3.2} textAnchor="middle">
                            {s.loc.name}
                        </text>
                        {s.locked && minLevel && (
                            <text className="req" x={s.x} y={s.y + R + 6} textAnchor="middle">
                                Lv {minLevel}
                            </text>
                        )}
                        {s.current && (
                            <path className="pin" d={`M ${s.x} ${s.y - R - 0.8} l -1.6 -2.4 h 3.2 z`} />
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
