import React from 'react';
import { EngineState, PlayerCommand, ItemId, InventoryStack, EquipmentState } from '@rpg-loom/shared';

interface Props {
    state: EngineState;
    itemStack: InventoryStack;
    content: any; // Using any for now to avoid deep type imports, or we can assume it matches ContentIndex
    dispatch: (cmd: PlayerCommand) => void;
    onClose: () => void;
}

export function InventoryItemDetail({ state, itemStack, content, dispatch, onClose }: Props) {
    const def = content?.itemsById?.[itemStack.itemId];
    const itemType = def?.type || 'unknown';
    const isEquippable = itemType === 'weapon' || itemType === 'armor' || itemType === 'accessory';
    const isConsumable = itemType === 'consumable';
    const isEquipped = Object.values(state.equipment).includes(itemStack.itemId);

    const handleEquip = () => {
        let slot: keyof EquipmentState = 'weapon';
        if (itemType === 'armor') slot = 'armor';
        if (itemType === 'accessory') slot = 'accessory1';

        dispatch({ type: 'EQUIP_ITEM', itemId: itemStack.itemId, slot, atMs: Date.now() });
        onClose();
    };

    const handleConsume = () => {
        dispatch({ type: 'USE_ITEM', itemId: itemStack.itemId, atMs: Date.now() });
        onClose();
    };

    const name = def?.name || itemStack.itemId;

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div className="card" style={{ maxWidth: '400px', width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '2px solid var(--color-gold)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-gold)' }}>{name}</h2>
                    <button onClick={onClose} style={{
                        background: 'transparent',
                        border: '1px solid var(--color-gold)',
                        color: 'var(--color-gold)',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        fontSize: '1.0rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1
                    }}>&times;</button>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '3rem', background: '#222', padding: '1rem', borderRadius: '8px', border: `1px solid var(--border-${def?.rarity || 'common'})` }}>
                        {itemType === 'weapon' ? '⚔️' : itemType === 'armor' ? '🛡️' : itemType === 'consumable' ? '🧪' : '📦'}
                    </div>
                    <div>
                        <div style={{ color: 'var(--color-gold)', textTransform: 'uppercase', fontSize: '0.8rem', marginBottom: '0.2rem' }}>{def?.rarity} {itemType}</div>
                        <div style={{ fontStyle: 'italic', color: '#aaa', fontSize: '0.9rem' }}>
                            {def?.description || "A mysterious object."}
                        </div>
                    </div>
                </div>

                {/* Stats Block */}
                {def?.modifiers && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#888', fontSize: '0.8rem', textTransform: 'uppercase' }}>Stats</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                            {Object.entries(def.modifiers).map(([key, val]: any) => (
                                <div key={key}>
                                    {val >= 0 ? '+' : ''}{val} {key.toUpperCase()}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {isEquippable && !isEquipped && (
                        <button onClick={handleEquip} style={{ flex: 1, borderColor: 'var(--color-gold)' }}>Equip</button>
                    )}
                    {isEquipped && (
                        <div style={{ flex: 1, textAlign: 'center', padding: '0.8rem', color: '#666', border: '1px solid #333', borderRadius: '4px' }}>Equipped</div>
                    )}
                    {isConsumable && (
                        <button onClick={handleConsume} style={{ flex: 1, borderColor: 'var(--color-success)' }}>Use</button>
                    )}
                </div>

                <div style={{ marginTop: '1rem', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>
                    Quantity: {itemStack.qty}
                </div>
            </div>
        </div>
    );
}
