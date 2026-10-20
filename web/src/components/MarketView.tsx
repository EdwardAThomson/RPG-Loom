import { useState } from 'react';
import { Coins, Minus, Plus } from 'lucide-react';
import { EngineState, PlayerCommand, ItemDef } from '@rpg-loom/shared';
import { ItemIcon } from './ItemIcon';
import { junkStacks, sellPrice } from '../ui/market';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

export function MarketView({ state, dispatch, content }: Props) {
    const { player, inventory } = state;
    const items: ItemDef[] = content?.itemsById ? Object.values(content.itemsById) : [];
    // How many of each stack the player has dialled up to sell.
    const [picked, setPicked] = useState<Record<string, number>>({});
    // Selling junk clears several stacks at once, so it takes a second click.
    const [confirmJunk, setConfirmJunk] = useState(false);

    // Items available for purchase: common consumables and basic gear.
    const shopItems = items.filter(item =>
        (item.type === 'consumable' || item.type === 'weapon' || item.type === 'armor') &&
        item.rarity === 'common' && item.value > 0
    );

    const junk = junkStacks(state, content);
    const junkIds = new Set(junk.map(s => s.itemId));
    const junkValue = junk.reduce((sum, s) => sum + sellPrice(content.itemsById[s.itemId]) * s.qty, 0);
    const junkNames = junk.map(s => `${content.itemsById[s.itemId].name} ×${s.qty}`).join(', ');

    const buy = (item: ItemDef) => dispatch({ type: 'BUY_ITEM', itemId: item.id, qty: 1, atMs: Date.now() });
    const sell = (itemId: string, qty: number, atMs = Date.now()) => {
        dispatch({ type: 'SELL_ITEM', itemId, qty, atMs });
        setPicked(p => ({ ...p, [itemId]: 1 }));
    };
    const sellJunk = () => {
        const atMs = Date.now();
        for (const stack of junk) sell(stack.itemId, stack.qty, atMs);
        setConfirmJunk(false);
    };

    return (
        <div className="two-col">
            <section className="hud-panel">
                <div className="panel-head">
                    <span className="hud-label">Buy</span>
                    <span className="small gold">{player.gold.toLocaleString()} gold</span>
                </div>
                <div className="list">
                    {shopItems.map(item => {
                        const canAfford = player.gold >= item.value;
                        return (
                            <div key={item.id} className="row-card">
                                <ItemIcon type={item.type} />
                                <div className="grow">
                                    <div className="list-title">{item.name}</div>
                                    <div className="list-sub">{item.description}</div>
                                </div>
                                <button type="button" className="btn-sm" disabled={!canAfford} onClick={() => buy(item)}>
                                    {item.value} g
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="hud-panel">
                <div className="panel-head">
                    <span className="hud-label">Sell</span>
                    <span className="small muted">Merchants pay half value</span>
                </div>
                {junk.length > 0 && (
                    <div className="callout sell-junk">
                        <div className="grow">
                            <div className="list-title">Junk worth {junkValue.toLocaleString()} gold</div>
                            <div className="list-sub">No recipe or quest uses {junkNames}.</div>
                        </div>
                        {confirmJunk ? (
                            <div className="sell-confirm">
                                <button type="button" className="btn-sm" onClick={() => setConfirmJunk(false)}>
                                    Cancel
                                </button>
                                <button type="button" className="primary btn-icon" onClick={sellJunk}>
                                    <Coins size={16} strokeWidth={1.8} aria-hidden />
                                    Sell for {junkValue.toLocaleString()} g
                                </button>
                            </div>
                        ) : (
                            <button type="button" className="primary btn-icon" onClick={() => setConfirmJunk(true)}>
                                <Coins size={16} strokeWidth={1.8} aria-hidden />
                                Sell junk
                            </button>
                        )}
                    </div>
                )}
                {inventory.length === 0 && <p className="empty">Nothing to sell.</p>}
                <div className="list">
                    {inventory.map(stack => {
                        const item = content.itemsById[stack.itemId];
                        if (!item) return null;
                        const price = sellPrice(item);
                        const qty = Math.min(picked[stack.itemId] ?? 1, stack.qty);
                        const setQty = (n: number) =>
                            setPicked(p => ({ ...p, [stack.itemId]: Math.max(1, Math.min(stack.qty, n)) }));
                        return (
                            <div key={stack.itemId} className="row-card sell-row">
                                <ItemIcon type={item.type} />
                                <div className="grow">
                                    <div className="list-title">
                                        {item.name} <span className="muted">×{stack.qty}</span>
                                        {junkIds.has(stack.itemId) && <span className="chip chip-muted">Junk</span>}
                                    </div>
                                    <div className="list-sub">{price} g each</div>
                                </div>
                                <div className="sell-controls">
                                    {stack.qty > 1 && (
                                        <div className="stepper" role="group" aria-label={`Quantity of ${item.name} to sell`}>
                                            <button type="button" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
                                                <Minus size={14} aria-hidden />
                                            </button>
                                            <input
                                                className="input"
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                max={stack.qty}
                                                value={qty}
                                                aria-label="Quantity"
                                                onChange={e => setQty(Math.floor(Number(e.target.value) || 1))}
                                            />
                                            <button type="button" aria-label="One more" disabled={qty >= stack.qty} onClick={() => setQty(qty + 1)}>
                                                <Plus size={14} aria-hidden />
                                            </button>
                                        </div>
                                    )}
                                    {stack.qty > 1 && (
                                        <button
                                            type="button"
                                            className="btn-sm"
                                            disabled={qty >= stack.qty}
                                            title="Set the amount to the whole stack"
                                            onClick={() => setQty(stack.qty)}
                                        >
                                            All
                                        </button>
                                    )}
                                    <button type="button" className="btn-sm" onClick={() => sell(stack.itemId, qty)}>
                                        Sell {qty > 1 ? `${qty} ` : ''}for {(price * qty).toLocaleString()} g
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
