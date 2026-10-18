import { EngineState, PlayerCommand, ItemDef } from '@rpg-loom/shared';
import { ItemIcon } from './ItemIcon';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

export function MarketView({ state, dispatch, content }: Props) {
    const { player, inventory } = state;
    const items: ItemDef[] = content?.itemsById ? Object.values(content.itemsById) : [];

    // Items available for purchase: common consumables and basic gear.
    const shopItems = items.filter(item =>
        (item.type === 'consumable' || item.type === 'weapon' || item.type === 'armor') &&
        item.rarity === 'common' && item.value > 0
    );

    const buy = (item: ItemDef) => dispatch({ type: 'BUY_ITEM', itemId: item.id, qty: 1, atMs: Date.now() });
    const sell = (itemId: string) => dispatch({ type: 'SELL_ITEM', itemId, qty: 1, atMs: Date.now() });

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
                {inventory.length === 0 && <p className="empty">Nothing to sell.</p>}
                <div className="list">
                    {inventory.map(stack => {
                        const item = content.itemsById[stack.itemId];
                        if (!item) return null;
                        const sellValue = Math.floor(item.value * 0.5);
                        return (
                            <div key={stack.itemId} className="row-card">
                                <ItemIcon type={item.type} />
                                <div className="grow">
                                    <div className="list-title">{item.name} <span className="muted">×{stack.qty}</span></div>
                                </div>
                                <button type="button" className="btn-sm" onClick={() => sell(stack.itemId)}>
                                    Sell 1 for {sellValue} g
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
