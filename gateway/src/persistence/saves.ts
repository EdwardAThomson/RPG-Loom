import { randomUUID } from 'node:crypto';
import { getPool, query } from './db.js';

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
 * Thrown by `upsertSave` when the caller's `expectedGeneration` doesn't
 * match the row in the database — i.e. someone else wrote it first.
 * The caller (the API layer) should surface this as 409 along with the
 * current server-side state so the client can reconcile.
 */
export class SaveConflictError extends Error {
  readonly current: SaveRow;
  constructor(current: SaveRow) {
    super(`Save generation conflict for slot ${current.slot}`);
    this.name = 'SaveConflictError';
    this.current = current;
  }
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
  return rowToSave(result.rows[0]);
}

export interface UpsertSaveInput {
  userId: string;
  slot: number;
  engineVersion: number;
  contentVersion: string;
  state: Record<string, any>;
  /**
   * Last generation the client saw, or undefined for a brand-new slot.
   * If the row exists and its generation doesn't match, throws
   * SaveConflictError. The check is performed inside a transaction so
   * concurrent writers can't both succeed.
   */
  expectedGeneration?: number;
}

/**
 * Insert or update a save with an optimistic concurrency check.
 *
 *  - No row → insert at generation 1 (regardless of expectedGeneration).
 *  - Row exists, expectedGeneration matches → update, generation += 1.
 *  - Row exists, expectedGeneration does not match → SaveConflictError
 *    carrying the current server-side row for the client to reconcile.
 *
 * Returns the row as it ends up in the database after the write.
 */
export async function upsertSave(input: UpsertSaveInput): Promise<SaveRow> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');

    // FOR UPDATE serializes concurrent writers on the same slot so we
    // can read-then-write without losing the race.
    const existing = await client.query<{
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
       from saves where user_id = $1 and slot = $2
       for update`,
      [input.userId, input.slot]
    );

    if (existing.rowCount === 0) {
      const inserted = await client.query<{
        id: string;
        user_id: string;
        slot: number;
        engine_version: number;
        content_version: string;
        state: Record<string, any>;
        generation: string;
        updated_at: Date;
      }>(
        `insert into saves
           (id, user_id, slot, engine_version, content_version, state, generation, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, 1, now())
         returning id, user_id, slot, engine_version, content_version, state, generation, updated_at`,
        [
          randomUUID(),
          input.userId,
          input.slot,
          input.engineVersion,
          input.contentVersion,
          JSON.stringify(input.state)
        ]
      );
      await client.query('commit');
      return rowToSave(inserted.rows[0]);
    }

    const current = rowToSave(existing.rows[0]);
    if (input.expectedGeneration !== undefined && input.expectedGeneration !== current.generation) {
      await client.query('rollback');
      throw new SaveConflictError(current);
    }

    const updated = await client.query<{
      id: string;
      user_id: string;
      slot: number;
      engine_version: number;
      content_version: string;
      state: Record<string, any>;
      generation: string;
      updated_at: Date;
    }>(
      `update saves
         set engine_version = $1,
             content_version = $2,
             state = $3::jsonb,
             generation = generation + 1,
             updated_at = now()
       where user_id = $4 and slot = $5
       returning id, user_id, slot, engine_version, content_version, state, generation, updated_at`,
      [
        input.engineVersion,
        input.contentVersion,
        JSON.stringify(input.state),
        input.userId,
        input.slot
      ]
    );
    await client.query('commit');
    return rowToSave(updated.rows[0]);
  } catch (err) {
    try { await client.query('rollback'); } catch { /* already rolled back */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete a save slot. Returns true if a row was deleted, false if none
 * existed.
 */
export async function deleteSave(userId: string, slot: number): Promise<boolean> {
  const result = await query(
    `delete from saves where user_id = $1 and slot = $2`,
    [userId, slot]
  );
  return (result.rowCount ?? 0) > 0;
}

function rowToSave(r: {
  id: string;
  user_id: string;
  slot: number;
  engine_version: number;
  content_version: string;
  state: Record<string, any>;
  generation: string;
  updated_at: Date;
}): SaveRow {
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
