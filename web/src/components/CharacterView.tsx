import React from 'react';
import { EngineState, PlayerCommand, ContentIndex, SkillId } from '@rpg-loom/shared';
import { EquipSlot } from './EquipSlot';

interface Props {
    state: EngineState;
    dispatch: (cmd: PlayerCommand) => void;
    content: ContentIndex;
}

export function CharacterView({ state, dispatch, content }: Props) {
    const { player } = state;
    const stats = player.baseStats;

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <section className="card">
                <h2>Attributes</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>ATK: {stats.atk}</div>
                    <div>DEF: {stats.def}</div>
                    <div>HP: {stats.hp} / {stats.hpMax}</div>
                </div>
            </section>

            <section className="card">
                <h2>Equipment</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    <EquipSlot label="Weapon" itemId={state.equipment.weapon} content={content} />
                    <EquipSlot label="Armor" itemId={state.equipment.armor} content={content} />
                    <EquipSlot label="Accessory 1" itemId={state.equipment.accessory1} content={content} />
                    <EquipSlot label="Accessory 2" itemId={state.equipment.accessory2} content={content} />
                </div>
            </section>

            <section className="card">
                <h2>Skills</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                    {([
                        'swordsmanship', 'marksmanship', 'arcana', 'defense',
                        'blacksmithing', 'woodworking', 'leatherworking',
                        'mining', 'woodcutting', 'foraging'
                    ] as SkillId[]).map((skillId) => {
                        const skill = player.skills[skillId] || { id: skillId, level: 1, xp: 0 };
                        const nameMap: Record<string, string> = {
                            swordsmanship: 'Melee',
                            marksmanship: 'Ranged',
                            arcana: 'Magic',
                            blacksmithing: 'Smithing',
                            woodworking: 'Woodcraft',
                            leatherworking: 'Leatherwork',
                            defense: 'Defense',
                            mining: 'Mining',
                            woodcutting: 'Woodcutting',
                            foraging: 'Foraging'
                        };

                        return (
                            <div key={skillId} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333' }}>
                                <div style={{ textTransform: 'capitalize', color: 'var(--color-gold)' }}>{nameMap[skillId] || skillId}</div>
                                <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Lvl {skill.level}</div>
                                <div style={{ fontSize: '0.8rem', color: '#666' }}>XP: {Math.floor(skill.xp)}</div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div >
    );
}


