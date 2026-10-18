import { BookOpen, Compass, Hammer, Map as MapIcon, Backpack, ScrollText, User, Users, LucideIcon } from 'lucide-react';

export type TabId = 'activity' | 'travel' | 'inventory' | 'crafting' | 'character' | 'quests' | 'journal' | 'npcs' | 'settings' | 'debug';

interface Props {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'activity', label: 'Activity', icon: Compass },
    { id: 'travel', label: 'Travel', icon: MapIcon },
    { id: 'inventory', label: 'Inventory', icon: Backpack },
    { id: 'crafting', label: 'Crafting', icon: Hammer },
    { id: 'character', label: 'Character', icon: User },
    { id: 'quests', label: 'Quests', icon: ScrollText },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'npcs', label: 'Folk', icon: Users },
];

export function Navigation({ activeTab, onTabChange }: Props) {
    return (
        <nav className="hud-nav" aria-label="Main">
            {TABS.map(({ id, label, icon: Icon }) => (
                <button
                    key={id}
                    type="button"
                    className={`nav-item${activeTab === id ? ' is-active' : ''}`}
                    aria-current={activeTab === id ? 'page' : undefined}
                    data-tour={`nav-${id}`}
                    onClick={() => onTabChange(id)}
                >
                    <Icon size={16} strokeWidth={1.8} aria-hidden />
                    <span>{label}</span>
                </button>
            ))}
        </nav>
    );
}
