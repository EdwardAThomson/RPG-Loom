import React, { useMemo, useState } from 'react';
import { EngineState, PlayerCommand, RecipeDef } from '@rpg-loom/shared';

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
        return stack && stack.qty >= qty;
    };

    const getItemName = (itemId: string) => {
        return content?.itemsById?.[itemId]?.name || itemId;
    };

    const isCrafting = (recipeId: string) => {
        return activity.params.type === 'craft' && activity.params.recipeId === recipeId;
    };

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
                const out = getItemName(r.outputs[0]?.itemId ?? '').toLowerCase();
                if (!out.includes(lowerFilter)) continue;
            }
            const key = r.skill ?? 'other';
            (groups[key] ??= []).push(r);
        }
        for (const k of Object.keys(groups)) {
            groups[k].sort((a, b) =>
                (a.requiredSkillLevel ?? 1) - (b.requiredSkillLevel ?? 1)
            );
        }
        return groups;
        // getItemName / hasItem depend on content + inventory, which
        // both update upstream — recompute is cheap (O(recipes)).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipes, filter, content, inventory]);

    const skillsInOrder = Object.keys(grouped).sort();

    const toggle = (skill: string) =>
        setExpanded(prev =>
            prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
        );

    const isOpen = (skill: string) =>
        filterActive || craftingSkill === skill || expanded.includes(skill);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <section className="card">
                <h2>Crafting Station</h2>
                <input
                    type="text"
                    placeholder="Search recipes..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                        padding: '0.5rem',
                        marginBottom: '1rem',
                        background: '#222',
                        border: '1px solid #444',
                        color: '#fff',
                        width: '100%',
                        borderRadius: '4px'
                    }}
                />

                {activity.params.type === 'craft' && (
                    <button
                        onClick={() => dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() })}
                        style={{
                            width: '100%',
                            marginBottom: '1rem',
                            padding: '0.75rem',
                            background: '#333',
                            border: '1px solid #555',
                            color: '#fff',
                            cursor: 'pointer',
                            borderRadius: '4px'
                        }}
                    >
                        ⏹ Stop Crafting
                    </button>
                )}

                {skillsInOrder.length === 0 && (
                    <div style={{ color: '#888', fontStyle: 'italic', padding: '0.5rem' }}>
                        No recipes match.
                    </div>
                )}

                {skillsInOrder.map(skill => {
                    const list = grouped[skill];
                    const playerLevel = (state.player.skills as any)[skill]?.level ?? 1;
                    const craftableCount = list.filter(r =>
                        r.inputs.every(i => hasItem(i.itemId, i.qty)) &&
                        (r.requiredSkillLevel ?? 1) <= playerLevel
                    ).length;
                    const open = isOpen(skill);
                    return (
                        <div key={skill} style={{ marginBottom: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => toggle(skill)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                    padding: '0.5rem 0.75rem',
                                    background: '#181818',
                                    border: '1px solid #333',
                                    borderRadius: '4px',
                                    color: '#ddd',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.9rem',
                                    textTransform: 'capitalize'
                                }}
                            >
                                <span>
                                    {open ? '▼' : '▶'} {skill}
                                    <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.75rem', textTransform: 'none' }}>
                                        Lv {playerLevel}
                                    </span>
                                </span>
                                <span style={{ color: '#888', fontSize: '0.75rem' }}>
                                    {craftableCount} / {list.length} craftable
                                </span>
                            </button>

                            {open && (
                                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem', paddingLeft: '0.5rem' }}>
                                    {list.map(recipe => {
                                        const canCraft = recipe.inputs.every(i => hasItem(i.itemId, i.qty))
                                            && (recipe.requiredSkillLevel ?? 1) <= playerLevel;
                                        const outputItem = recipe.outputs[0];
                                        const name = getItemName(outputItem.itemId);

                                        return (
                                            <div key={recipe.id} style={{
                                                background: 'rgba(0,0,0,0.2)',
                                                border: isCrafting(recipe.id) ? '1px solid var(--color-gold)' : '1px solid #333',
                                                padding: '0.75rem',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div>
                                                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff', fontSize: '1rem' }}>
                                                        {name} {outputItem.qty > 1 && `x${outputItem.qty}`}
                                                    </h3>
                                                    <div style={{ fontSize: '0.75rem', color: playerLevel >= (recipe.requiredSkillLevel ?? 1) ? '#888' : '#d97757', marginBottom: '6px' }}>
                                                        Needs: <span style={{ textTransform: 'capitalize' }}>{recipe.skill}</span> Lv.{recipe.requiredSkillLevel || 1}
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                                                        {recipe.inputs.map((input, idx) => {
                                                            const haveIt = hasItem(input.itemId, input.qty);
                                                            return (
                                                                <span key={idx} style={{ marginRight: '1rem', color: haveIt ? '#8f8' : '#f88' }}>
                                                                    {input.qty} {getItemName(input.itemId)}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        if (isCrafting(recipe.id)) {
                                                            dispatch({ type: 'SET_ACTIVITY', params: { type: 'idle' }, atMs: Date.now() });
                                                        } else {
                                                            dispatch({
                                                                type: 'SET_ACTIVITY',
                                                                params: { type: 'craft', recipeId: recipe.id },
                                                                atMs: Date.now()
                                                            });
                                                        }
                                                    }}
                                                    disabled={!canCraft && !isCrafting(recipe.id)}
                                                    style={{
                                                        opacity: canCraft || isCrafting(recipe.id) ? 1 : 0.5,
                                                        background: isCrafting(recipe.id) ? '#d44' : undefined,
                                                        color: isCrafting(recipe.id) ? '#fff' : undefined,
                                                        borderColor: isCrafting(recipe.id) ? '#f66' : undefined,
                                                        cursor: canCraft || isCrafting(recipe.id) ? 'pointer' : 'not-allowed'
                                                    }}
                                                >
                                                    {isCrafting(recipe.id) ? 'Stop' : 'Craft'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>
        </div>
    );
}
