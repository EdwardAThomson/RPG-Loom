import { EngineState, PlayerCommand, InventoryStack, EquipmentState } from '@rpg-loom/shared';
import { ItemIcon } from './ItemIcon';
import { Modal } from './Modal';

interface Props {
    state: EngineState;
    itemStack: InventoryStack;
    content: any;
    dispatch: (cmd: PlayerCommand) => void;
    onClose: () => void;
}

export function InventoryModal({ state, itemStack, content, dispatch, onClose }: Props) {
    const def = content?.itemsById?.[itemStack.itemId];
    const itemType = def?.type || 'unknown';
    const rarity: string = def?.rarity || 'common';
    const isEquippable = itemType === 'weapon' || itemType === 'armor' || itemType === 'accessory' || itemType === 'tool';
    const isConsumable = itemType === 'consumable';
    const isEquipped = Object.values(state.equipment).includes(itemStack.itemId);

    const handleEquip = () => {
        let slot: keyof EquipmentState = 'weapon';
        if (itemType === 'armor') slot = 'armor';
        if (itemType === 'accessory' || itemType === 'tool') {
            // Tools ride in the accessory slots; take the first free one.
            slot = state.equipment.accessory1 && !state.equipment.accessory2 ? 'accessory2' : 'accessory1';
        }

        dispatch({ type: 'EQUIP_ITEM', itemId: itemStack.itemId, slot, atMs: Date.now() });
        onClose();
    };

    const handleConsume = () => {
        dispatch({ type: 'USE_ITEM', itemId: itemStack.itemId, atMs: Date.now() });
        onClose();
    };

    const handleUnequip = () => {
        const slot = (Object.keys(state.equipment) as Array<keyof EquipmentState>)
            .find(key => state.equipment[key] === itemStack.itemId);

        if (slot) {
            dispatch({ type: 'UNEQUIP_ITEM', slot, atMs: Date.now() });
            onClose();
        }
    };

    const name = def?.name || itemStack.itemId;
    const hasActions = (isEquippable && !isEquipped) || isEquipped || isConsumable;

    return (
        <Modal
            title={name}
            subtitle={<span className={`rarity-${rarity}`}>{rarity} {itemType}</span>}
            onClose={onClose}
        >
            <div className="slot">
                <div className="item-icon">
                    <ItemIcon type={itemType} size={28} />
                </div>
                <div className="slot-body">
                    <p className="prose">
                        {def?.description || 'A mysterious object.'}
                    </p>
                </div>
            </div>

            {def?.modifiers && (
                <div className="section">
                    <div className="hud-label">Stats</div>
                    <div className="stat-grid">
                        {Object.entries(def.modifiers).map(([key, val]: any) => (
                            <div key={key} className="stat-tile">
                                <div className="stat-value">{val >= 0 ? '+' : ''}{val}</div>
                                <div className="stat-label">{key}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {hasActions && (
                <div className="btn-row section">
                    {isEquippable && !isEquipped && (
                        <button type="button" className="primary" onClick={handleEquip}>Equip</button>
                    )}
                    {isEquipped && (
                        <button type="button" onClick={handleUnequip}>Unequip</button>
                    )}
                    {isConsumable && (
                        <button type="button" className="primary" onClick={handleConsume}>Use</button>
                    )}
                </div>
            )}

            <p className="hint">Quantity: {itemStack.qty}</p>
        </Modal>
    );
}
