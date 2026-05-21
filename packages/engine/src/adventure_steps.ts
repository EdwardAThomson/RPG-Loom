import type { AdventureStepTemplate } from '@rpg-loom/shared';

/**
 * Single source of truth for the dynamic_<kind>_<target> template-id
 * convention used by adventure sub-quests. Without this, adding a new
 * step type silently failed in any of four places (spawn,
 * bumpQuestProgressFrom*, completion routing, web parser); the
 * exhaustiveness checks here turn that into typecheck errors.
 */

export const ADVENTURE_STEP_KINDS = [
  'kill',
  'gather',
  'craft',
  'travel',
  'explore',
  'deliver'
] as const;

export type AdventureStepKind = typeof ADVENTURE_STEP_KINDS[number];

/**
 * Whether a kind embeds a target id in its dynamic templateId (e.g.
 * `dynamic_kill_<enemyId>`) or stands alone (`dynamic_travel`,
 * `dynamic_explore`). `deliver` deliberately uses the deliver-target
 * itemId in its templateId; the targetLocationId lives on q.locationId.
 */
const KIND_HAS_TARGET: Record<AdventureStepKind, boolean> = {
  kill: true,
  gather: true,
  craft: true,
  travel: false,
  explore: false,
  deliver: true
};

/**
 * Result of parsing a dynamic_* templateId. `kind` is the adventure
 * step kind; `targetId` is the suffix (enemy/item/recipe id), null
 * for fixed-form kinds (travel, explore).
 */
export interface ParsedDynamicTemplateId {
  kind: AdventureStepKind;
  targetId: string | null;
}

/**
 * Parse a dynamic_* templateId into a {kind, targetId} discriminated
 * result. Returns null for non-dynamic ids and for the parent
 * `dynamic_adventure` marker. Used in:
 *   - bumpQuestProgressFrom{Kill,Loot,Craft} routing
 *   - runOneTick's quest-activity sub-dispatch
 *   - checkTravelQuests, checkDeliverQuests, progressExploreQuests
 *   - the UI quest list filters
 *
 * Routing on the returned `kind` should use an exhaustive switch
 * (assertNever as the default) so adding a new step type is caught
 * at typecheck.
 */
export function parseDynamicTemplateId(templateId: string): ParsedDynamicTemplateId | null {
  // Parent adventure quest carries no per-step semantics.
  if (templateId === 'dynamic_adventure') return null;

  // Order matters: fixed-form kinds first, then prefix-form kinds.
  if (templateId === 'dynamic_travel') return { kind: 'travel', targetId: null };
  if (templateId === 'dynamic_explore') return { kind: 'explore', targetId: null };

  for (const kind of ADVENTURE_STEP_KINDS) {
    if (!KIND_HAS_TARGET[kind]) continue;
    const prefix = `dynamic_${kind}_`;
    if (templateId.startsWith(prefix)) {
      return { kind, targetId: templateId.slice(prefix.length) };
    }
  }

  return null;
}

/**
 * Build the dynamic_* templateId for an adventure step template.
 * Inverse of `parseDynamicTemplateId` — used by spawnAdventureSubQuest
 * to mint sub-quest ids that match what the progress routing expects.
 *
 * The exhaustive switch guarantees this stays in sync with
 * AdventureStepTemplate; adding a new variant to the type without
 * updating this function is a typecheck error.
 */
export function buildDynamicTemplateId(template: AdventureStepTemplate): string {
  switch (template.type) {
    case 'kill':    return `dynamic_kill_${template.targetEnemyId}`;
    case 'gather':  return `dynamic_gather_${template.targetItemId}`;
    case 'craft':   return `dynamic_craft_${template.targetRecipeId}`;
    case 'deliver': return `dynamic_deliver_${template.targetItemId}`;
    case 'travel':  return 'dynamic_travel';
    case 'explore': return 'dynamic_explore';
    default:        return assertNever(template);
  }
}

/**
 * Typecheck-time exhaustiveness check. Use as the `default` branch
 * of a switch on a discriminated union to force coverage of every
 * variant. If a new variant is added, this branch becomes reachable
 * with a non-`never` argument and TypeScript fails the build.
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminated-union case: ${JSON.stringify(x)}`);
}
