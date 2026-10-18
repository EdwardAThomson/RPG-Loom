import { useMemo, useState } from 'react';
import { ChevronRight, Search, Square } from 'lucide-react';
import { EngineState, PlayerCommand, RecipeDef } from '@rpg-loom/shared';
import { itemName, skillName } from '../ui/labels';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

export function CraftingView({ state, dispatch, content }: Props) {
    const { activity, inventory } = state;
    const recipes: RecipeDef[] = content?.recipesById ? Object.values(content.recipesById) : [];
    const [filter, setFilter] = useState('');
    // Tracks which skill sections the user has explicitly toggled open.
    // Default empty = all collapsed; filtering and active crafting
    // override this implicitly so the player isn't left looking at a
    // closed section.
    const [expanded, setExpanded] = useState<string[]>([]);

    const hasItem = (itemId: string, qty: number) => {
        const stack = inventory.find(s => s.itemId === itemId);
        return !!stack && stack.qty >= qty;
    };

    const isCrafting = (recipeId: string) =>
        activity.params.type === 'craft' && activity.params.recipeId === recipeId;

    const filterActive = filter.trim().length > 0;
    const lowerFilter = filter.toLowerCase();

    // Skill currently being crafted in, used to auto-expand its section.
    const craftingSkill: string | null = useMemo(() => {
        if (activity.params.type !== 'craft') return null;
        const r = content?.recipesById?.[activity.params.recipeId];
        return r?.skill ?? null;
    }, [activity, content]);

    // Group recipes by skill and apply the search filter. Sort recipes
    // within each section by required skill level ascending so the
    // natural progression reads top-to-bottom.
    const grouped = useMemo(() => {
        const groups: Record<string, RecipeDef[]> = {};
        for (const r of recipes) {
            if (filterActive) {
                const out = itemName(content, r.outputs[0]?.itemId ?? '').toLowerCase();
                if (!out.includes(lowerFilter)) continue;
            }
            const key = r.skill ?? 'other';
            (groups[key] ??= []).push(r);
        }
        for (const k of Object.keys(groups)) {
            groups[k].sort((a, b) => (a.requiredSkillLevel ?? 1) - (b.requiredSkillLevel ?? 1));
        }
        return groups;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipes, filter, content, inventory]);

    const skillsInOrder = Object.keys(grouped).sort();

    const toggle = (skill: string) =>
        setExpanded(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);

    const isOpen = (skill: string) =>
        filterActive || craftingSkill === skill || expanded.includes(skill);

    const stop = () => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() });

    return (
        <section className="card">
            <h2>Workshop</h2>
            <div className="panel-head">
                <label className="search">
                    <Search size={14} aria-hidden />
                    <input
                        id="recipe-search"
                        type="search"
                        className="input"
                        placeholder="Search recipes"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </label>
                {activity.params.type === 'craft' && (
                    <button type="button" className="btn-ghost" onClick={stop}>
                        <Square size={12} aria-hidden /> Stop crafting
                    </button>
                )}
            </div>

            {skillsInOrder.length === 0 && <p className="empty">No recipes match.</p>}

            <div className="list">
                {skillsInOrder.map(skill => {
                    const list = grouped[skill];
                    const playerLevel = (state.player.skills as any)[skill]?.level ?? 1;
                    const craftable = list.filter(r =>
                        r.inputs.every(i => hasItem(i.itemId, i.qty)) && (r.requiredSkillLevel ?? 1) <= playerLevel
                    ).length;
                    const open = isOpen(skill);
                    return (
                        <div key={skill}>
                            <button
                                type="button"
                                className={`disclosure${open ? ' is-open' : ''}`}
                                aria-expanded={open}
                                onClick={() => toggle(skill)}
                            >
                                <span className="disclosure-title">
                                    <ChevronRight size={16} aria-hidden />
                                    {skillName(skill)}
                                    <span className="small muted">Lv {playerLevel}</span>
                                </span>
                                <span className="small muted">{craftable} of {list.length} craftable</span>
                            </button>

                            {open && (
                                <div className="list recipe-list">
                                    {list.map(recipe => {
                                        const needLevel = recipe.requiredSkillLevel ?? 1;
                                        const hasLevel = playerLevel >= needLevel;
                                        const hasInputs = recipe.inputs.every(i => hasItem(i.itemId, i.qty));
                                        const canCraft = hasLevel && hasInputs;
                                        const active = isCrafting(recipe.id);
                                        const out = recipe.outputs[0];
                                        return (
                                            <div key={recipe.id} className={`row-card${active ? ' is-active' : ''}`}>
                                                <div className="grow">
                                                    <div className="list-title">
                                                        {itemName(content, out.itemId)}{out.qty > 1 ? ` ×${out.qty}` : ''}
                                                        {!hasLevel && <span className="chip chip-warn">Needs Lv {needLevel}</span>}
                                                    </div>
                                                    <div className="list-sub">
                                                        {recipe.inputs.map((input, i) => (
                                                            <span key={i} className={hasItem(input.itemId, input.qty) ? 'ok' : 'warn'}>
                                                                {i > 0 && <span className="faint"> · </span>}
                                                                {input.qty} {itemName(content, input.itemId)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={active ? 'btn-sm' : 'primary btn-sm'}
                                                    disabled={!canCraft && !active}
                                                    onClick={() => active ? stop() : dispatch({
                                                        type: 'SET_ACTIVITY',
                                                        params: { type: 'craft', recipeId: recipe.id },
                                                        atMs: Date.now()
                                                    })}
                                                >
                                                    {active ? 'Stop' : 'Craft'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
