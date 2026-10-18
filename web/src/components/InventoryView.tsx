import { useState } from 'react';
import { EngineState, PlayerCommand, InventoryStack } from '@rpg-loom/shared';
import { InventoryModal } from './InventoryModal';
import { EquipSlot } from './EquipSlot';
import { ItemIcon } from './ItemIcon';
import { itemName } from '../ui/labels';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any;
}

const SLOTS = [
    ['weapon', 'Weapon'],
    ['armor', 'Armour'],
    ['accessory1', 'Accessory 1'],
    ['accessory2', 'Accessory 2'],
] as const;

export function InventoryView({ state, dispatch, content }: Props) {
    const [selected, setSelected] = useState<InventoryStack | null>(null);
    const equipped = new Set(Object.values(state.equipment).filter(Boolean));

    return (
        <>
            <section className="card">
                <h2>Equipment</h2>
                <div className="slot-grid">
                    {SLOTS.map(([slot, label]) => {
                        const id = state.equipment[slot];
                        return (
                            <EquipSlot
                                key={slot}
                                label={label}
                                itemId={id}
                                content={content}
                                onClick={() => id && setSelected({ itemId: id, qty: 1 })}
                            />
                        );
                    })}
                </div>

                <div className="section">
                    <div className="panel-head">
                        <span className="hud-label">Pack</span>
                        <span className="small muted">{state.inventory.length} kinds of item</span>
                    </div>
                    {state.inventory.length === 0 ? (
                        <p className="empty">Your pack is empty. Gather, hunt or buy something.</p>
                    ) : (
                        <div className="inventory-grid">
                            {state.inventory.map(stack => {
                                const def = content?.itemsById?.[stack.itemId];
                                return (
                                    <button
                                        key={stack.itemId}
                                        type="button"
                                        className={`inventory-item rarity-${def?.rarity ?? 'common'}`}
                                        title={itemName(content, stack.itemId)}
                                        onClick={() => setSelected(stack)}
                                    >
                                        <ItemIcon type={def?.type} size={20} />
                                        <span className="name">{itemName(content, stack.itemId)}</span>
                                        <span className="qty">×{stack.qty}</span>
                                        {equipped.has(stack.itemId) && <span className="equipped-badge">Worn</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {selected && (
                <InventoryModal
                    state={state}
                    itemStack={selected}
                    content={content}
                    dispatch={dispatch}
                    onClose={() => setSelected(null)}
                />
            )}
        </>
    );
}
