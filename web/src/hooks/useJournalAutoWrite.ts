import { useEffect, useRef } from 'react';
import type { ContentIndex, GameEvent } from '@rpg-loom/shared';
import { getAuthState, onAuthChange } from '../services/auth';
import { pushJournalEntry } from '../services/journal';

/**
 * Watches the engine's event stream and writes a journal entry to the
 * cloud whenever a journal-worthy quest completes. No AI calls —
 * entries are templated from the event payload + content lookups, so
 * this works with AI disabled.
 *
 * - Skips when the user is signed-out (no cloud destination).
 * - Filters out adventure sub-quests (the `dynamic_kill_<id>` etc.
 *   noise) — only the parent adventure or template-defined quests
 *   produce journal entries.
 * - Deduplicates via the event's `atMs` high-water mark; sliding-window
 *   redeliveries of the same event don't double-post.
 * - Fire-and-forget — failures are logged but never bubble up.
 */

const CLOUD_SLOT = 0;

function isJournalWorthyQuest(templateId: string): boolean {
  if (templateId === 'dynamic_adventure') return true;
  if (templateId.startsWith('dynamic_')) return false;
  return true;
}

export function useJournalAutoWrite(events: GameEvent[], content: ContentIndex): void {
  const highWaterAtMsRef = useRef(0);
  const isMountedRef = useRef(false);

  // Reset high-water when the user signs in/out so a re-login doesn't
  // replay every event in the buffer.
  useEffect(() => {
    const unsub = onAuthChange(() => {
      highWaterAtMsRef.current = Date.now();
    });
    return unsub;
  }, []);

  useEffect(() => {
    // First pass after mount: don't replay the existing buffer. Set
    // the high-water to the latest event we've seen and bail.
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (events.length > 0) {
        highWaterAtMsRef.current = events[events.length - 1].atMs;
      }
      return;
    }

    if (getAuthState().status !== 'signed-in') return;

    let newHighWater = highWaterAtMsRef.current;
    for (const ev of events) {
      if (ev.atMs <= highWaterAtMsRef.current) continue;
      if (ev.atMs > newHighWater) newHighWater = ev.atMs;

      if (ev.type === 'QUEST_COMPLETED') {
        const payload = ev.payload as { questId: string; templateId: string; rewards: any };
        if (!isJournalWorthyQuest(payload.templateId)) continue;

        const tmpl = content.questTemplatesById[payload.templateId];
        const title = tmpl?.name ?? (payload.templateId === 'dynamic_adventure' ? 'Adventure' : payload.templateId);

        const lines: string[] = [`Completed: ${title}.`];
        const rewards = payload.rewards ?? {};
        if (typeof rewards.xp === 'number' && rewards.xp > 0) lines.push(`Gained ${rewards.xp} XP.`);
        if (typeof rewards.gold === 'number' && rewards.gold !== 0) {
          lines.push(rewards.gold > 0 ? `Earned ${rewards.gold} gold.` : `Spent ${Math.abs(rewards.gold)} gold.`);
        }

        void pushJournalEntry(CLOUD_SLOT, {
          type: 'journal_entry',
          refs: { questId: payload.questId, questTemplateId: payload.templateId },
          block: {
            id: ev.id,
            title,
            lines,
            tags: ['quest', payload.templateId === 'dynamic_adventure' ? 'adventure' : 'template']
          }
        }).catch(err => {
          console.warn('Journal auto-write failed', err);
        });
      } else if (ev.type === 'NPC_INTERACTED') {
        // Only the first meeting is journal-worthy. Repeat talks are
        // routine and would spam the log.
        const payload = ev.payload as { npcId: string; affinity: number; firstMeet: boolean };
        if (!payload.firstMeet) continue;

        const npc = content.npcsById?.[payload.npcId];
        const npcName = npc?.name ?? payload.npcId;
        const location = npc ? content.locationsById[npc.locationId] : undefined;
        const locationSuffix = location ? ` at ${location.name}` : '';

        void pushJournalEntry(CLOUD_SLOT, {
          type: 'journal_entry',
          refs: { npcId: payload.npcId },
          block: {
            id: ev.id,
            title: `Met ${npcName}`,
            lines: [`First meeting${locationSuffix}.`],
            tags: ['npc', 'first-meet']
          }
        }).catch(err => {
          console.warn('Journal auto-write failed', err);
        });
      }
    }
    highWaterAtMsRef.current = newHighWater;
  }, [events, content]);
}
