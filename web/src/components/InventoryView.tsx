import React, { useState } from 'react';
import { EngineState, PlayerCommand, InventoryStack } from '@rpg-loom/shared';
import { InventoryModal } from './InventoryModal';
import { EquipSlot } from './EquipSlot';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: any; // TODO: Strict types
}

export function InventoryView({ state, dispatch, content }: Props) {
    const [selectedStack, setSelectedStack] = useState<InventoryStack | null>(null);

    // Helper to get item name from content (fallback to ID)
    const getName = (id: string) => content?.itemsById?.[id]?.name || id.replace('item_', '');

    return (
        <>
            <section className="card full-height">
                <h2>Equipment</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.8rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #333' }}>
                    <EquipSlot label="Weapon" itemId={state.equipment.weapon} content={content} onClick={() => state.equipment.weapon && setSelectedStack({ itemId: state.equipment.weapon, qty: 1 })} />
                    <EquipSlot label="Armor" itemId={state.equipment.armor} content={content} onClick={() => state.equipment.armor && setSelectedStack({ itemId: state.equipment.armor, qty: 1 })} />
                    <EquipSlot label="Acc 1" itemId={state.equipment.accessory1} content={content} onClick={() => state.equipment.accessory1 && setSelectedStack({ itemId: state.equipment.accessory1, qty: 1 })} />
                    <EquipSlot label="Acc 2" itemId={state.equipment.accessory2} content={content} onClick={() => state.equipment.accessory2 && setSelectedStack({ itemId: state.equipment.accessory2, qty: 1 })} />
                </div>

                <h2>Inventory</h2>
                <div className="inventory-grid">
                    {state.inventory.map((item: any) => (
                        <div
                            key={item.itemId}
                            className="inventory-item"
                            title={item.itemId}
                            onClick={() => setSelectedStack(item)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div style={{ marginBottom: 4 }}>
                                {/* Basic icon mapping */}
                                {content?.itemsById?.[item.itemId]?.type === 'weapon' ? '⚔️' :
                                    content?.itemsById?.[item.itemId]?.type === 'armor' ? '🛡️' :
                                        content?.itemsById?.[item.itemId]?.type === 'consumable' ? '🧪' : '📦'}
                            </div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', fontSize: '0.7rem' }}>
                                {getName(item.itemId)}
                            </div>
                            <div className="qty">x{item.qty}</div>

                            {/* Equipped Indicator */}
                            {Object.values(state.equipment).includes(item.itemId) && (
                                <div style={{ position: 'absolute', top: 2, right: 2, color: 'var(--color-gold)', fontSize: '0.6rem' }}>E</div>
                            )}
                        </div>
                    ))}
                    {state.inventory.length === 0 && <div className="empty" style={{ gridColumn: '1/-1', textAlign: 'center', color: '#666', padding: '2rem' }}>Empty</div>}
                </div>

            </section>

            {selectedStack && (
                <InventoryModal
                    state={state}
                    itemStack={selectedStack}
                    content={content}
                    dispatch={dispatch}
                    onClose={() => setSelectedStack(null)}
                />
            )}
        </>
    );
}
