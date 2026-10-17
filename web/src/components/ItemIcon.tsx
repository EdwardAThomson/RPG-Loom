import { FlaskConical, Gem, Package, Shield, Swords, LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
    weapon: Swords,
    armor: Shield,
    accessory: Gem,
    consumable: FlaskConical,
};

/** Icon for an item type; falls back to a crate for materials and unknowns. */
export function ItemIcon({ type, size = 18 }: { type?: string; size?: number }) {
    const Icon = (type && ICONS[type]) || Package;
    return <Icon size={size} strokeWidth={1.6} aria-hidden />;
}
