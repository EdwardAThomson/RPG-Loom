import { ContentIndex } from '@rpg-loom/shared';
import { ItemIcon } from './ItemIcon';

interface Props {
    label: string;
    itemId?: string;
    content: ContentIndex;
    onClick?: () => void;
}

export function EquipSlot({ label, itemId, content, onClick }: Props) {
    const item = itemId ? content.itemsById[itemId] : null;
    const mods = item?.modifiers
        ? Object.entries(item.modifiers).map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${k.toUpperCase()}`).join(' · ')
        : null;

    const body = (
        <>
            <ItemIcon type={item?.type} size={20} />
            <div className="slot-body">
                <div className="slot-label">{label}</div>
                <div>{item ? item.name : 'Empty'}</div>
                {mods && <div className="slot-mods">{mods}</div>}
            </div>
        </>
    );

    const cls = `slot ${item ? 'is-filled' : 'is-empty'}`;
    if (onClick && item) {
        return <button type="button" className={cls} onClick={onClick}>{body}</button>;
    }
    return <div className={cls}>{body}</div>;
}
