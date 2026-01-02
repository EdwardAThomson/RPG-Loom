import React, { useState } from 'react';
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

    const filteredRecipes = recipes.filter(r => {
        const outName = getItemName(r.outputs[0].itemId).toLowerCase();
        return outName.includes(filter.toLowerCase());
    });

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

                <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredRecipes.map(recipe => {
                        const canCraft = recipe.inputs.every(i => hasItem(i.itemId, i.qty));
                        const outputItem = recipe.outputs[0];
                        const name = getItemName(outputItem.itemId);

                        return (
                            <div key={recipe.id} style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: isCrafting(recipe.id) ? '1px solid var(--color-gold)' : '1px solid #333',
                                padding: '1rem',
                                borderRadius: '4px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>
                                        {name} {outputItem.qty > 1 && `x${outputItem.qty}`}
                                    </h3>
                                    <div style={{ fontSize: '0.9rem', color: '#aaa' }}>
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
            </section>
        </div>
    );
}
