/**
 * Journal / narrative store client.
 *
 * Wraps the gateway's /api/saves/:slot/narrative endpoints. Returns
 * null when the user is signed-out, the gateway is unreachable, or
 * the save slot doesn't exist server-side — callers should treat those
 * as "skip, do nothing" rather than errors.
 */

import { gatewayFetch } from './gateway';
import { getToken } from './auth';

export interface JournalBlock {
  id?: string;
  title?: string;
  lines?: string[];
  tags?: string[];
}

export interface JournalEntry {
  id: string;
  saveId: string;
  type: string;
  refs: Record<string, string>;
  block: JournalBlock;
  createdAt: string; // ISO
}

export interface PushJournalEntryInput {
  type: string;
  refs?: Record<string, string>;
  block: JournalBlock;
}

export interface FetchJournalOptions {
  limit?: number;
  types?: string[];
  order?: 'asc' | 'desc';
}

function authHeader(): Record<string, string> | null {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function fetchJournal(
  slot: number,
  opts: FetchJournalOptions = {}
): Promise<JournalEntry[] | null> {
  const auth = authHeader();
  if (!auth) return null;

  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.types?.length) params.set('type', opts.types.join(','));
  if (opts.order) params.set('order', opts.order);
  const qs = params.toString() ? `?${params.toString()}` : '';

  try {
    const res = await gatewayFetch(`/api/saves/${slot}/narrative${qs}`, { headers: auth });
    if (!res.ok) return null;
    const body = (await res.json()) as { entries: JournalEntry[] };
    return body.entries;
  } catch {
    return null;
  }
}

export async function pushJournalEntry(
  slot: number,
  input: PushJournalEntryInput
): Promise<JournalEntry | null> {
  const auth = authHeader();
  if (!auth) return null;

  try {
    const res = await gatewayFetch(`/api/saves/${slot}/narrative`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { entry: JournalEntry };
    return body.entry;
  } catch {
    return null;
  }
}
