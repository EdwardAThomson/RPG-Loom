import React from 'react';
import { EngineState, PlayerCommand, ItemDef } from '@rpg-loom/shared';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

export function MarketView({ state, dispatch, content }: Props) {
    const { player, inventory } = state;
    const items: ItemDef[] = content?.itemsById ? Object.values(content.itemsById) : [];

    // Filter items available for purchase (e.g., common consumables and basic gear)
    const shopItems = items.filter(item =>
        (item.type === 'consumable' || item.type === 'weapon' || item.type === 'armor') &&
        item.rarity === 'common' && item.value > 0
    );

    const handleBuy = (item: ItemDef) => {
        dispatch({ type: 'BUY_ITEM', itemId: item.id, qty: 1, atMs: Date.now() });
    };

    const handleSell = (itemId: string, qty: number) => {
        dispatch({ type: 'SELL_ITEM', itemId, qty, atMs: Date.now() });
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* BUY SECTION */}
            <section className="card">
                <h3>Local Market (Buy)</h3>
                <div style={{ marginBottom: '1rem', color: 'var(--color-gold)' }}>
                    Your Gold: {player.gold}
                </div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {shopItems.map(item => {
                        const canAfford = player.gold >= item.value;
                        return (
                            <div key={item.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.5rem', border: '1px solid #333', borderRadius: '4px'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#888' }}>{item.description}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>{item.value}g</div>
                                </div>
                                <button
                                    onClick={() => handleBuy(item)}
                                    disabled={!canAfford}
                                    style={{
                                        padding: '0.25rem 0.5rem',
                                        background: canAfford ? '#444' : '#222',
                                        color: canAfford ? '#fff' : '#555',
                                        border: '1px solid #555',
                                        cursor: canAfford ? 'pointer' : 'default'
                                    }}
                                >
                                    Buy
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* SELL SECTION */}
            <section className="card">
                <h3>Sell Items</h3>
                <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                    Merchants buy at 50% value.
                </div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {inventory.length === 0 && <div style={{ color: '#666' }}>Inventory empty</div>}
                    {inventory.map(stack => {
                        const item = content.itemsById[stack.itemId];
                        if (!item) return null;
                        const sellValue = Math.floor(item.value * 0.5);

                        return (
                            <div key={stack.itemId} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.5rem', border: '1px solid #333', borderRadius: '4px'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{item.name} (x{stack.qty})</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>Sell for: {sellValue}g</div>
                                </div>
                                <button
                                    onClick={() => handleSell(stack.itemId, 1)}
                                    style={{
                                        padding: '0.25rem 0.5rem',
                                        background: '#444',
                                        color: '#fff',
                                        border: '1px solid #555',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Sell 1
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
