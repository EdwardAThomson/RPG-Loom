import { Modal } from './Modal';
import { Play } from 'lucide-react';

interface Props {
    onClose: () => void;
    onReplayTour: () => void;
}

const SECTIONS: { title: string; body: string }[] = [
    {
        title: 'Activities keep running',
        body: 'Pick an activity on the Activity tab: woodcutting, mining, foraging or hunting in the wilds; resting, trading or training in town. It carries on while the tab is closed. When you return you get a summary of everything that happened.',
    },
    {
        title: 'Skills and levels',
        body: 'Every activity trains a skill. Skill levels add up to your total level, and the combat skills set your combat level. The Character tab shows each skill and how far it is from the next level.',
    },
    {
        title: 'Travel',
        body: 'The world map on the Travel tab shows every region. Locked ones list what you need, usually a total or combat level. Each region has its own resources and dangers.',
    },
    {
        title: 'Quests and folk',
        body: 'Townsfolk on the Folk tab hand out quests, and the quest board in a region lists work for that place. A quest happens at a set location: travel there, then press Start quest. Hand finished quests back to the person who gave them.',
    },
    {
        title: 'Crafting and the market',
        body: 'Recipes unlock as your crafting skills rise. Buy basic gear and consumables at the market in town, and sell spare loot there for half its value.',
    },
    {
        title: 'Saving',
        body: 'Your game saves to this browser automatically. Sign in under Settings to keep a cloud save and a journal that follow you across devices.',
    },
];

export function HelpModal({ onClose, onReplayTour }: Props) {
    return (
        <Modal title="How to play" onClose={onClose}>
            {SECTIONS.map(s => (
                <div key={s.title} className="modal-section">
                    <h3>{s.title}</h3>
                    <p className="prose">{s.body}</p>
                </div>
            ))}
            <div className="btn-row">
                <button type="button" className="primary" onClick={() => { onClose(); onReplayTour(); }}>
                    <Play size={12} aria-hidden /> Replay the tour
                </button>
            </div>
        </Modal>
    );
}
