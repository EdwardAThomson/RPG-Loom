import type { GameEvent, OfflineSummary } from '@rpg-loom/shared';

export interface SummarizeOptions {
  durationMs: number;
  cappedAtMs?: number;
}

export function summarizeEvents(events: GameEvent[], opts: SummarizeOptions): OfflineSummary {
  const summary: OfflineSummary = {
    durationMs: opts.durationMs,
    ticksProcessed: 0,
    cappedAtMs: opts.cappedAtMs,
    kills: {},
    loot: {},
    xpGained: 0,
    goldDelta: 0,
    questsCompleted: 0,
    levelUps: 0
  };

  for (const e of events) {
    switch (e.type) {
      case 'TICK_PROCESSED':
        summary.ticksProcessed += e.payload.ticks;
        break;
      case 'ENCOUNTER_RESOLVED':
        if (e.payload.outcome === 'win') {
          summary.kills[e.payload.enemyId] = (summary.kills[e.payload.enemyId] ?? 0) + 1;
        }
        break;
      case 'LOOT_GAINED':
        for (const item of e.payload.items) {
          summary.loot[item.itemId] = (summary.loot[item.itemId] ?? 0) + item.qty;
        }
        break;
      // Skill XP is what persists (player.xp is their sum). XP_GAINED
      // amounts are nominal and don't match it, e.g. combat grants skill
      // XP every round but XP_GAINED only on a kill.
      case 'SKILL_XP_GAINED':
        summary.xpGained += e.payload.amount;
        break;
      case 'GOLD_CHANGED':
        summary.goldDelta += e.payload.amount;
        break;
      case 'QUEST_COMPLETED':
        summary.questsCompleted += 1;
        break;
      case 'LEVEL_UP':
        summary.levelUps += 1;
        break;
    }
  }

  return summary;
}
