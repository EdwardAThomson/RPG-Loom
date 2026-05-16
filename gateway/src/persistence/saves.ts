import { query } from './db.js';

/**
 * Row shape exposed by the persistence layer. The `state` jsonb is
 * returned as a parsed object — the API layer is responsible for
 * serializing it back to the client.
 */
export interface SaveRow {
  id: string;
  userId: string;
  slot: number;
  engineVersion: number;
  contentVersion: string;
  state: Record<string, any>;
  generation: number;
  updatedAt: Date;
}

export interface SaveMetadata {
  id: string;
  slot: number;
  engineVersion: number;
  contentVersion: string;
  generation: number;
  updatedAt: Date;
}

/**
 * List a user's save slots without the bulky `state` blob — useful for
 * a slot picker.
 */
export async function listSaves(userId: string): Promise<SaveMetadata[]> {
  const result = await query<{
    id: string;
    slot: number;
    engine_version: number;
    content_version: string;
    generation: string; // bigint comes back as string from pg
    updated_at: Date;
  }>(
    `select id, slot, engine_version, content_version, generation, updated_at
     from saves
     where user_id = $1
     order by slot asc`,
    [userId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    engineVersion: r.engine_version,
    contentVersion: r.content_version,
    generation: Number(r.generation),
    updatedAt: r.updated_at
  }));
}

/**
 * Fetch the full save (with `state` blob) for one slot. Returns null if
 * the user has nothing in that slot.
 */
export async function getSave(userId: string, slot: number): Promise<SaveRow | null> {
  const result = await query<{
    id: string;
    user_id: string;
    slot: number;
    engine_version: number;
    content_version: string;
    state: Record<string, any>;
    generation: string;
    updated_at: Date;
  }>(
    `select id, user_id, slot, engine_version, content_version, state, generation, updated_at
     from saves
     where user_id = $1 and slot = $2`,
    [userId, slot]
  );

  if (result.rowCount === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    slot: r.slot,
    engineVersion: r.engine_version,
    contentVersion: r.content_version,
    state: r.state,
    generation: Number(r.generation),
    updatedAt: r.updated_at
  };
}
