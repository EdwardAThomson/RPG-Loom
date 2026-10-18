import { ActivityParams, EngineState, GameEvent, NpcDef, PlayerCommand, SkillId } from '@rpg-loom/shared';
import { useMemo, useState } from 'react';
import { Axe, BedDouble, Coins, Leaf, Pickaxe, Shield, Sparkles, Square, Swords, Target, LucideIcon } from 'lucide-react';
import { TacticsSelector } from './TacticsSelector';
import { MarketView } from './MarketView';
import { NpcDialogueModal } from './NpcDialogueModal';
import { activityLabel, activitySkill, enemyName, humanize, skillName, skillProgress } from '../ui/labels';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
    events?: GameEvent[];
}

type Action = {
    key: string;
    label: string;
    icon: LucideIcon;
    params: ActivityParams;
    active: boolean;
    disabled?: boolean;
    note?: string;
};

const TRAINING: { skillId: SkillId; label: string; icon: LucideIcon }[] = [
    { skillId: 'swordsmanship', label: 'Sword', icon: Swords },
    { skillId: 'defense', label: 'Shield', icon: Shield },
    { skillId: 'marksmanship', label: 'Archery', icon: Target },
    { skillId: 'arcana', label: 'Magic', icon: Sparkles },
];

export function ActivityView({ state, dispatch, content, events }: Props) {
    const { activity, player } = state;
    const [activeNpc, setActiveNpc] = useState<NpcDef | null>(null);

    const location = content?.locationsById?.[state.currentLocationId];
    const locName = location?.name || state.currentLocationId;
    const isTown = location?.type === 'town';
    const type = activity.params.type;

    // NPCs at this location, so the player can talk without leaving the
    // Activity tab. The engine enforces the location check too.
    const npcsHere: NpcDef[] = useMemo(() => {
        const all = Object.values(content?.npcsById ?? {}) as NpcDef[];
        return all
            .filter(n => n.locationId === state.currentLocationId)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [content?.npcsById, state.currentLocationId]);

    const set = (params: ActivityParams) => dispatch({ type: 'SET_ACTIVITY', params, atMs: Date.now() });

    const actions: Action[] = isTown
        ? [
            { key: 'recovery', label: 'Rest at the inn', icon: BedDouble, params: { type: 'recovery', durationMs: 10000 }, active: type === 'recovery', note: 'Heal' },
            { key: 'trade', label: 'Visit market', icon: Coins, params: { type: 'trade', locationId: state.currentLocationId }, active: type === 'trade' },
        ]
        : ([
            { key: 'woodcut', label: 'Woodcut', icon: Axe, skill: 'woodcutting' },
            { key: 'mine', label: 'Mine', icon: Pickaxe, skill: 'mining' },
            { key: 'forage', label: 'Forage', icon: Leaf, skill: 'foraging' },
            { key: 'hunt', label: 'Hunt', icon: Swords, skill: null },
        ] as const)
            .filter(a => location?.activities?.includes(a.key))
            .map(a => ({
                key: a.key,
                label: a.label,
                icon: a.icon,
                params: { type: a.key, locationId: state.currentLocationId } as ActivityParams,
                active: type === a.key,
                note: a.skill ? `Lv ${player.skills[a.skill]?.level ?? 1}` : 'Fight',
            }));

    const skill = activitySkill(activity.params, state, content);
    const skillState = skill ? (player.skills[skill] ?? { id: skill, level: 1, xp: 0 }) : null;
    const progress = skillState ? skillProgress(skillState.xp, skillState.level) : null;
    const focusedQuest = findFocusedQuest(state, content);
    const inCombatActivity = !!state.activeEncounter || type === 'hunt';

    return (
        <>
            {inCombatActivity && (
                <section className="hud-panel combat">
                    {state.activeEncounter ? (
                        <>
                            <div className="combat-head">
                                <span className="hud-label">Fighting</span>
                                <span className="combat-level">Lv {state.activeEncounter.enemyLevel}</span>
                            </div>
                            <div className="combat-name">{enemyName(content, state.activeEncounter.enemyId)}</div>
                            <span className="bar bar-enemy">
                                <i style={{ width: `${(state.activeEncounter.enemyHp / Math.max(1, state.activeEncounter.enemyMaxHp)) * 100}%` }} />
                            </span>
                            <div className="combat-hp">{state.activeEncounter.enemyHp} / {state.activeEncounter.enemyMaxHp}</div>
                        </>
                    ) : (
                        <>
                            <span className="hud-label">Hunting</span>
                            <div className="combat-name is-searching">Searching for foes…</div>
                        </>
                    )}
                    <div className="combat-stance">
                        <span className="hud-label">Stance</span>
                        <TacticsSelector player={player} dispatch={dispatch} />
                    </div>
                </section>
            )}

            <section className={`hud-panel dock${type === 'idle' ? ' is-idle' : ''}`} aria-label="Current activity">
                <div className="dock-head">
                    <div>
                        <h2 className="dock-title">
                            {activityLabel(activity.params, content)}
                            {skillState && (
                                <span className="dock-level">
                                    {' · '}{activityLabel(activity.params, content).includes(skillName(skillState.id)) ? '' : `${skillName(skillState.id)} `}Lv {skillState.level}
                                </span>
                            )}
                        </h2>
                        {type === 'idle' && <p className="dock-sub">Choose something to do in {locName}.</p>}
                        {focusedQuest && <span className="chip chip-quest">Quest: {focusedQuest}</span>}
                    </div>
                    <div className="dock-meta">
                        {progress && <span>{progress.into} / {progress.span} XP</span>}
                        {type !== 'idle' && (
                            <button type="button" className="btn-ghost" onClick={() => set({ type: 'idle' })}>
                                <Square size={12} aria-hidden /> Stop
                            </button>
                        )}
                    </div>
                </div>
                {progress && <span className="bar bar-xp"><i style={{ width: `${progress.pct}%` }} /></span>}

                <div className="hud-label dock-section">{type === 'idle' ? 'What will you do?' : 'Switch to'}</div>
                <div className="action-grid">
                    {actions.map(a => (
                        <button
                            key={a.key}
                            type="button"
                            className={`action${a.active ? ' is-active' : ''}`}
                            aria-pressed={a.active}
                            onClick={() => set(a.params)}
                        >
                            <a.icon size={16} strokeWidth={1.8} aria-hidden />
                            <span>{a.label}</span>
                            {a.note && <small>{a.note}</small>}
                        </button>
                    ))}
                </div>

                {isTown && (
                    <>
                        <div className="hud-label dock-section">Training grounds · 1 gold per session</div>
                        <div className="action-grid">
                            {TRAINING.map(t => {
                                const active = type === 'train' && (activity.params as { skillId: SkillId }).skillId === t.skillId;
                                return (
                                    <button
                                        key={t.skillId}
                                        type="button"
                                        className={`action${active ? ' is-active' : ''}`}
                                        aria-pressed={active}
                                        disabled={player.gold < 1}
                                        onClick={() => set({ type: 'train', skillId: t.skillId })}
                                    >
                                        <t.icon size={16} strokeWidth={1.8} aria-hidden />
                                        <span>{t.label}</span>
                                        <small>Lv {player.skills[t.skillId]?.level ?? 1}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>

            {type === 'trade' && <MarketView state={state} dispatch={dispatch} content={content} />}

            {npcsHere.length > 0 && (
                <section className="hud-panel folk-here">
                    <div className="hud-label">Folk here</div>
                    {npcsHere.map(npc => {
                        const entry = state.npcState?.[npc.id];
                        const known = entry?.firstMetAtMs !== undefined;
                        return (
                            <div key={npc.id} className="list-row">
                                <div>
                                    <div className="list-title">{npc.name}</div>
                                    <div className="list-sub">
                                        {humanize(npc.role)}{known ? ` · affinity ${entry?.affinity ?? 0}` : ' · not yet met'}
                                    </div>
                                </div>
                                <button type="button" className="btn-secondary" onClick={() => setActiveNpc(npc)}>
                                    {known ? 'Talk' : 'Greet'}
                                </button>
                            </div>
                        );
                    })}
                </section>
            )}

            {activeNpc && (
                <NpcDialogueModal
                    npc={activeNpc}
                    state={state}
                    content={content}
                    dispatch={dispatch}
                    onClose={() => setActiveNpc(null)}
                    recentEvents={events}
                />
            )}
        </>
    );
}

/** Name of the active quest the current activity is advancing, if any. */
function findFocusedQuest(state: EngineState, content: any): string | null {
    const params = state.activity.params;
    const here = 'locationId' in params ? params.locationId : null;
    const quest = state.quests.filter(q => q.status === 'active').find(q => {
        const t = q.templateId;
        if (t.startsWith('dynamic_gather_') && here === q.locationId) {
            const itemId = t.replace('dynamic_gather_', '');
            const loc = content?.locationsById?.[q.locationId];
            const kind = loc?.miningTable?.entries.some((e: any) => e.itemId === itemId) ? 'mine'
                : loc?.woodcuttingTable?.entries.some((e: any) => e.itemId === itemId) ? 'woodcut' : 'forage';
            return params.type === kind;
        }
        if (t === 'dynamic_explore') return params.type === 'explore' && here === q.locationId;
        if (t.startsWith('dynamic_kill_')) return params.type === 'hunt' && here === q.locationId;
        if (t.startsWith('dynamic_craft_')) return params.type === 'craft' && params.recipeId === t.replace('dynamic_craft_', '');
        return params.type === 'quest' && params.questId === q.id;
    });
    if (!quest) return null;
    return quest.aiNarrative?.title || content?.questTemplatesById?.[quest.templateId]?.name || humanize(quest.templateId.replace('dynamic_', ''));
}
