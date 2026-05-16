import { v4 as uuidv4 } from 'uuid';
import type { NarrativeBlockDTO, NarrativeTaskDTO } from '@rpg-loom/shared';

// Length budgets enforced by finalizeBlock — the third leg of E4
// alongside the no-invented-IDs validator. AI runs occasionally
// produce a paragraph per "line"; we trim to keep the UI readable
// and the journal store light.
export const MAX_LINES = 6;
export const MAX_CHARS_PER_LINE = 240;
export const MAX_CHARS_TOTAL = 1200;
export const MAX_TAGS = 8;
export const MAX_TITLE_CHARS = 80;

export function applyLengthBudget(rawLines: unknown): string[] {
  const arr = Array.isArray(rawLines)
    ? rawLines.map(String)
    : rawLines !== undefined && rawLines !== null
      ? [String(rawLines)]
      : [];

  const truncatedPerLine = arr
    .map(l => l.length > MAX_CHARS_PER_LINE
      ? l.slice(0, MAX_CHARS_PER_LINE - 1).trimEnd() + '…'
      : l)
    .filter(Boolean)
    .slice(0, MAX_LINES);

  // Drop trailing lines once the total budget is exhausted.
  const result: string[] = [];
  let total = 0;
  for (const l of truncatedPerLine) {
    if (total + l.length > MAX_CHARS_TOTAL) break;
    result.push(l);
    total += l.length;
  }
  return result;
}

export function finalizeBlock(obj: any, task: NarrativeTaskDTO): NarrativeBlockDTO {
  const title = typeof obj.title === 'string'
    ? (obj.title.length > MAX_TITLE_CHARS ? obj.title.slice(0, MAX_TITLE_CHARS - 1).trimEnd() + '…' : obj.title)
    : undefined;

  return {
    id: typeof obj.id === 'string' ? obj.id : uuidv4(),
    type: task.type,
    createdAtMs: typeof obj.createdAtMs === 'number' ? obj.createdAtMs : Date.now(),
    references: task.references ?? {},
    title,
    lines: applyLengthBudget(obj.lines),
    tags: Array.isArray(obj.tags) ? obj.tags.map(String).slice(0, MAX_TAGS) : ['gemini']
  };
}
