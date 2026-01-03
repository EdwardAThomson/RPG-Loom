import React from 'react';

export type TabId = 'activity' | 'travel' | 'inventory' | 'crafting' | 'character' | 'quests' | 'settings';

interface Props {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

export function Navigation({ activeTab, onTabChange }: Props) {
    const tabs: { id: TabId; label: string }[] = [
        { id: 'activity', label: 'Activity' },
        { id: 'travel', label: 'Travel' },
        { id: 'inventory', label: 'Inventory' },
        { id: 'crafting', label: 'Crafting' },
        { id: 'character', label: 'Character' },
        { id: 'quests', label: 'Quests' },
    ];

    return (
        <nav style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--bg-panel)', padding: '0.5rem', borderRadius: 'var(--radius-md) 0 0 var(--radius-md)' }}>
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    style={{
                        flex: 1,
                        background: activeTab === tab.id ? 'var(--color-gold)' : 'transparent',
                        color: activeTab === tab.id ? '#000' : 'var(--text-muted)',
                        border: activeTab === tab.id ? 'none' : '1px solid transparent',
                        fontWeight: activeTab === tab.id ? 'bold' : 'normal'
                    }}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}
