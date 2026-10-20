import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import type { TabId } from './Navigation';
import '../styles/tour.css';

export const TOUR_KEY = 'rpgloom.tour.v1';

export interface TourStep {
    /** CSS selector of the element to spotlight. */
    target: string;
    title: string;
    body: string;
    /** Tab that must be open for the target to exist. */
    tab?: TabId;
}

export const TOUR_STEPS: TourStep[] = [
    {
        target: '[data-tour="actions"]',
        tab: 'activity',
        title: 'Pick something to do',
        body: 'Choose an activity and it keeps running on its own, even while you are away. Come back later to collect what you gathered and the XP you earned.',
    },
    {
        target: '[data-tour="goals"]',
        title: 'Your next goals',
        body: 'This panel always shows the three nearest things worth doing: a recipe about to unlock, a region you are close to reaching, a quest to hand in. Click one to jump there.',
    },
    {
        target: '[data-tour="nav-travel"]',
        title: 'Travel the world',
        body: 'New regions unlock as your levels rise. The map shows what each place offers, and what you need to get in.',
    },
    {
        target: '[data-tour="nav-quests"]',
        title: 'Quests and folk',
        body: 'Townsfolk hand out quests; the Folk tab lists who is around. Quests happen at a set place, so travel there before you start one.',
    },
    {
        target: '[data-tour="help"]',
        title: 'Help is here',
        body: 'Open How to play any time for a short guide, or to replay this tour.',
    },
];

export function hasSeenTour(): boolean {
    try { return localStorage.getItem(TOUR_KEY) === 'done'; } catch { return true; }
}

export function markTourSeen() {
    try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* private mode */ }
}

interface Props {
    steps?: TourStep[];
    onTabChange: (tab: TabId) => void;
    onClose: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const CARD_W = 320;

/**
 * First-run coach marks. Draws a dimmed overlay with a cut-out around the
 * current step's target and a small card beside it. The overlay is an SVG
 * mask so it works regardless of the target's stacking context.
 */
export function Tour({ steps = TOUR_STEPS, onTabChange, onClose }: Props) {
    const [i, setI] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const step = steps[i];
    const last = i === steps.length - 1;

    // Make sure the target's tab is showing.
    useEffect(() => { if (step.tab) onTabChange(step.tab); }, [step.tab, onTabChange]);

    useLayoutEffect(() => {
        let raf = 0;
        const measure = () => {
            const el = document.querySelector<HTMLElement>(step.target);
            if (!el) { setRect(null); return; }
            const r = el.getBoundingClientRect();
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        };
        // The tab may have just switched; scroll the target into view first.
        const el = document.querySelector<HTMLElement>(step.target);
        // On phones the card is a bottom sheet, so bring the target to the
        // top of the screen where it stays visible above it.
        el?.scrollIntoView({ block: window.innerWidth < 760 ? 'start' : 'nearest', inline: 'nearest' });
        measure();
        const loop = () => { measure(); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [step.target]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') finish();
            if (e.key === 'ArrowRight' || e.key === 'Enter') next();
            if (e.key === 'ArrowLeft') back();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const finish = () => { markTourSeen(); onClose(); };
    const next = () => (last ? finish() : setI(i + 1));
    const back = () => setI(Math.max(0, i - 1));

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = vw < 760;

    // Card placement: below the target when there is room, else above;
    // clamped to the viewport. On phones it becomes a bottom sheet.
    let cardStyle: React.CSSProperties;
    if (narrow || !rect) {
        // Bottom sheet, unless the target sits in the lower half of the
        // screen (it may not scroll any higher); then the sheet goes on top.
        const lowTarget = !!rect && rect.top + rect.height / 2 > vh / 2;
        cardStyle = lowTarget ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: 84 };
    } else {
        const below = rect.top + rect.height + PAD + 12;
        const fitsBelow = below + 180 < vh;
        const left = Math.min(Math.max(12, rect.left), vw - CARD_W - 12);
        cardStyle = fitsBelow
            ? { left, top: below, width: CARD_W }
            : { left, bottom: vh - rect.top + PAD + 12, width: CARD_W };
    }

    return (
        <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
            <svg className="tour-mask" width="100%" height="100%" aria-hidden>
                <defs>
                    <mask id="tour-hole">
                        <rect width="100%" height="100%" fill="white" />
                        {rect && (
                            <rect
                                x={rect.left - PAD} y={rect.top - PAD}
                                width={rect.width + PAD * 2} height={rect.height + PAD * 2}
                                rx="10" fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect width="100%" height="100%" className="tour-dim" mask="url(#tour-hole)" />
                {rect && (
                    <rect
                        x={rect.left - PAD} y={rect.top - PAD}
                        width={rect.width + PAD * 2} height={rect.height + PAD * 2}
                        rx="10" className="tour-ring"
                    />
                )}
            </svg>

            <div className="tour-card" style={cardStyle}>
                <div className="tour-head">
                    <span className="hud-label">{i + 1} of {steps.length}</span>
                    <button type="button" className="modal-close" onClick={finish} aria-label="Skip tour"><X size={16} /></button>
                </div>
                <h3 id="tour-title">{step.title}</h3>
                <p>{step.body}</p>
                <div className="tour-foot">
                    <span className="tour-dots" aria-hidden>
                        {steps.map((_, k) => <i key={k} className={k === i ? 'is-on' : ''} />)}
                    </span>
                    <span className="btn-row">
                        {i > 0 && <button type="button" className="btn-sm" onClick={back}><ArrowLeft size={12} aria-hidden /> Back</button>}
                        <button type="button" className="primary btn-sm" onClick={next}>
                            {last ? 'Done' : <>Next <ArrowRight size={12} aria-hidden /></>}
                        </button>
                    </span>
                </div>
            </div>
        </div>
    );
}
