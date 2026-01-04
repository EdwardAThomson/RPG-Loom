import React from 'react';
import { ContentIndex } from '@rpg-loom/shared';

interface Props {
    label: string;
    itemId?: string;
    content: ContentIndex;
    onClick?: () => void;
}

export function EquipSlot({ label, itemId, content, onClick }: Props) {
    const item = itemId ? content.itemsById[itemId] : null;
    return (
        <div
            onClick={onClick}
            style={{
                background: 'rgba(0,0,0,0.2)',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #333',
                cursor: onClick ? 'pointer' : 'default',
                ...(onClick && { transition: 'border-color 0.2s' })
            }}
            onMouseEnter={e => {
                if (onClick) e.currentTarget.style.borderColor = 'var(--color-gold)';
            }}
            onMouseLeave={e => {
                if (onClick) e.currentTarget.style.borderColor = '#333';
            }}
        >
            <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ color: item ? 'var(--color-gold)' : '#555' }}>
                {item ? item.name : 'Empty'}
            </div>
            {item && item.modifiers && (
                <div style={{ fontSize: '0.7rem', color: '#aaa' }}>
                    {Object.entries(item.modifiers).map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${k.toUpperCase()}`).join(', ')}
                </div>
            )}
        </div>
    );
}
