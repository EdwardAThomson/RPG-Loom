import type { ContentIndex, EngineState, Goal } from '@rpg-loom/shared';

// How many levels of skill / level-gating away we're willing to surface
// as "almost there". Beyond this, the goal is too distant to be helpful.
const RECIPE_SKILL_LOOKAHEAD = 5;
const LOCATION_LEVEL_LOOKAHEAD = 5;
const LOCATION_STAT_LOOKAHEAD = 10;

// Active quests get pushed to the top of the rank space so a freshly-
// accepted quest (0/10 done = fraction 0) doesn't get buried under
// nearly-unlocked recipes. Mapped onto [0.5, 1.0].
function activeQuestRank(current: number, required: number): number {
  const fraction = required > 0 ? current / required : 0;
  return 0.5 + Math.min(1, Math.max(0, fraction)) * 0.5;
}

/**
 * Return the top-N things the player can productively work toward right now.
 *
 * Pure: reads state + content, writes nothing. Safe to call every render —
 * the work is O(quests + recipes + locations), all small in practice.
 *
 * Ranking is by "fraction-complete", higher first. Active quests are
 * boosted into the top half of the rank space so they always surface
 * before unrelated recipe goals.
 */
export function getNextGoals(state: EngineState, content: ContentIndex, limit = 3): Goal[] {
  type RankedGoal = Goal & { _rank: number };
  const candidates: RankedGoal[] = [];

  // (a) Active quests
  for (const q of state.quests) {
    if (q.status !== 'active') continue;
    const tmpl = content.questTemplatesById[q.templateId];
    const label = q.aiNarrative?.title ?? tmpl?.name ?? q.templateId;
    candidates.push({
      id: `quest:${q.id}`,
      label,
      category: 'quest',
      progress: { current: q.progress.current, required: q.progress.required },
      actionHint: { tab: 'quests', questId: q.id, questTemplateId: q.templateId },
      _rank: activeQuestRank(q.progress.current, q.progress.required)
    });
  }

  // (b) Recipes within skill lookahead
  for (const recipe of Object.values(content.recipesById)) {
    if (!recipe.requiredSkillLevel || !recipe.skill) continue;
    const skillState = state.player.skills[recipe.skill];
    const currentLevel = skillState?.level ?? 1;
    const requiredLevel = recipe.requiredSkillLevel;
    if (currentLevel >= requiredLevel) continue;
    if (requiredLevel - currentLevel > RECIPE_SKILL_LOOKAHEAD) continue;
    candidates.push({
      id: `recipe:${recipe.id}`,
      label: `Unlock ${recipe.name} (${recipe.skill} ${currentLevel}/${requiredLevel})`,
      category: 'recipe',
      progress: { current: currentLevel, required: requiredLevel },
      actionHint: { tab: 'crafting', recipeId: recipe.id },
      _rank: currentLevel / requiredLevel
    });
  }

  // (c) Locations the player can't reach yet, gated by a near-future
  // requirement. For each unmet gate compute a fraction; surface the
  // CLOSEST unmet gate so the player sees the wall they're actually
  // about to push through.
  for (const loc of Object.values(content.locationsById)) {
    if (loc.id === state.currentLocationId) continue;
    const reqs = loc.requirements;
    if (!reqs) continue;

    type Unmet = { label: string; current: number; required: number; fraction: number };
    const unmet: Unmet[] = [];

    if (reqs.minLevel !== undefined && state.player.level < reqs.minLevel) {
      const delta = reqs.minLevel - state.player.level;
      if (delta <= LOCATION_LEVEL_LOOKAHEAD) {
        unmet.push({
          label: `Level ${state.player.level}/${reqs.minLevel}`,
          current: state.player.level,
          required: reqs.minLevel,
          fraction: state.player.level / reqs.minLevel
        });
      }
    }
    if (reqs.minCombatLevel !== undefined && state.player.combatLevel < reqs.minCombatLevel) {
      const delta = reqs.minCombatLevel - state.player.combatLevel;
      if (delta <= LOCATION_LEVEL_LOOKAHEAD) {
        unmet.push({
          label: `Combat ${state.player.combatLevel}/${reqs.minCombatLevel}`,
          current: state.player.combatLevel,
          required: reqs.minCombatLevel,
          fraction: state.player.combatLevel / reqs.minCombatLevel
        });
      }
    }
    if (reqs.minAtk !== undefined && state.player.baseStats.atk < reqs.minAtk) {
      const delta = reqs.minAtk - state.player.baseStats.atk;
      if (delta <= LOCATION_STAT_LOOKAHEAD) {
        unmet.push({
          label: `Atk ${state.player.baseStats.atk}/${reqs.minAtk}`,
          current: state.player.baseStats.atk,
          required: reqs.minAtk,
          fraction: state.player.baseStats.atk / reqs.minAtk
        });
      }
    }
    if (reqs.minDef !== undefined && state.player.baseStats.def < reqs.minDef) {
      const delta = reqs.minDef - state.player.baseStats.def;
      if (delta <= LOCATION_STAT_LOOKAHEAD) {
        unmet.push({
          label: `Def ${state.player.baseStats.def}/${reqs.minDef}`,
          current: state.player.baseStats.def,
          required: reqs.minDef,
          fraction: state.player.baseStats.def / reqs.minDef
        });
      }
    }
    // Note: minSkills and requiredFlags exist in the type but no
    // location content uses them today (2026-05-15). Add branches here
    // if/when content does.

    if (unmet.length === 0) continue; // accessible or gated too far away

    // Closest unmet gate = highest fraction.
    const primary = unmet.reduce((best, u) => (u.fraction > best.fraction ? u : best));
    candidates.push({
      id: `location:${loc.id}`,
      label: `Unlock ${loc.name} (${primary.label})`,
      category: 'location',
      progress: { current: primary.current, required: primary.required },
      actionHint: { tab: 'travel', locationId: loc.id },
      _rank: primary.fraction
    });
  }

  candidates.sort((a, b) => b._rank - a._rank);

  // Strip the internal _rank field before returning.
  return candidates.slice(0, limit).map(({ _rank, ...rest }) => {
    void _rank;
    return rest;
  });
}
