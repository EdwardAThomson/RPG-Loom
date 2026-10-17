import { EngineState, PlayerCommand, ContentIndex, SkillId } from '@rpg-loom/shared';
import { EquipSlot } from './EquipSlot';
import { skillName, skillProgress } from '../ui/labels';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: ContentIndex;
}

const COMBAT_SKILLS: SkillId[] = ['swordsmanship', 'marksmanship', 'arcana', 'defense'];
const CRAFT_SKILLS: SkillId[] = ['blacksmithing', 'woodworking', 'leatherworking'];
const GATHER_SKILLS: SkillId[] = ['mining', 'woodcutting', 'foraging'];

export function CharacterView({ state, content }: Props) {
    const { player } = state;
    const s = player.baseStats;

    return (
        <div className="stack">
            <section className="card">
                <h2>{player.name || 'Wanderer'}</h2>
                <div className="stat-grid">
                    <Tile label="Total level" value={player.level} />
                    <Tile label="Combat level" value={player.combatLevel} />
                    <Tile label="Attack" value={s.atk} />
                    <Tile label="Defence" value={s.def} />
                    <Tile label="Speed" value={s.spd} />
                    <Tile label="Crit" value={`${Math.round(s.critChance * 100)}% ×${s.critMult}`} />
                    <Tile label="Gold" value={player.gold.toLocaleString()} gold />
                </div>
                <div className="section">
                    <div className="progress-row">
                        <span className="hud-label" style={{ width: 60 }}>Health</span>
                        <span className={`bar bar-hp${s.hp < s.hpMax * 0.3 ? ' is-low' : ''}`}>
                            <i style={{ width: `${s.hpMax ? (s.hp / s.hpMax) * 100 : 0}%` }} />
                        </span>
                        <span>{s.hp} / {s.hpMax}</span>
                    </div>
                </div>
            </section>

            <section className="card">
                <h2>Equipment</h2>
                <div className="slot-grid">
                    <EquipSlot label="Weapon" itemId={state.equipment.weapon} content={content} />
                    <EquipSlot label="Armour" itemId={state.equipment.armor} content={content} />
                    <EquipSlot label="Accessory 1" itemId={state.equipment.accessory1} content={content} />
                    <EquipSlot label="Accessory 2" itemId={state.equipment.accessory2} content={content} />
                </div>
            </section>

            <section className="card">
                <h2>Skills</h2>
                <SkillGroup title="Combat" ids={COMBAT_SKILLS} state={state} />
                <SkillGroup title="Crafting" ids={CRAFT_SKILLS} state={state} />
                <SkillGroup title="Gathering" ids={GATHER_SKILLS} state={state} />
            </section>
        </div>
    );
}

function Tile({ label, value, gold }: { label: string; value: string | number; gold?: boolean }) {
    return (
        <div className={`stat-tile${gold ? ' is-gold' : ''}`}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

function SkillGroup({ title, ids, state }: { title: string; ids: SkillId[]; state: EngineState }) {
    return (
        <div className="section">
            <div className="hud-label">{title}</div>
            <div className="skill-grid">
                {ids.map(id => {
                    const skill = state.player.skills[id] ?? { id, level: 1, xp: 0 };
                    const p = skillProgress(skill.xp, skill.level);
                    return (
                        <div key={id} className="skill-card">
                            <div className="row">
                                <span className="skill-name">{skillName(id)}</span>
                                <span className="skill-level">Lv {skill.level}</span>
                            </div>
                            <span className="bar bar-sm"><i style={{ width: `${p.pct}%` }} /></span>
                            <span className="skill-xp">{p.into} / {p.span} XP to Lv {skill.level + 1}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
