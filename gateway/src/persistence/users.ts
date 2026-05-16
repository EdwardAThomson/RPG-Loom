import { randomUUID } from 'node:crypto';
import { query } from './db.js';

export interface UserRow {
  id: string;
  externalId: string;
  displayName: string | null;
  createdAt: Date;
}

/**
 * Look up the user with this external id; create a new row if none
 * exists. Returns the canonical internal UUID either way.
 *
 * Race-safe via `ON CONFLICT (external_id) DO UPDATE` — two concurrent
 * inserts won't both create a row, and we still get the persisted row
 * back without a follow-up select.
 */
export async function findOrCreateUser(
  externalId: string,
  displayName?: string | null
): Promise<UserRow> {
  const result = await query<{
    id: string;
    external_id: string;
    display_name: string | null;
    created_at: Date;
  }>(
    `insert into users (id, external_id, display_name)
     values ($1, $2, $3)
     on conflict (external_id) do update
       set display_name = coalesce(excluded.display_name, users.display_name)
     returning id, external_id, display_name, created_at`,
    [randomUUID(), externalId, displayName ?? null]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    externalId: row.external_id,
    displayName: row.display_name,
    createdAt: row.created_at
  };
}
