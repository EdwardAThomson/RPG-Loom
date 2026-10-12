import type { Sql } from './pg';

// Port of gateway/src/persistence/{users,saves,narrative}.ts onto postgres.js.
// Same schema (gateway/src/persistence/schema.sql), same row shapes on the wire,
// so the web client can't tell the Worker from the local gateway.

export interface UserRow {
  id: string;
  externalId: string;
  displayName: string | null;
}

export interface SaveRow {
  id: string;
  userId: string;
  slot: number;
  engineVersion: number;
  contentVersion: string;
  state: Record<string, unknown>;
  generation: number;
  updatedAt: Date;
}

export type SaveMetadata = Omit<SaveRow, 'userId' | 'state'>;

export interface NarrativeBlockRow {
  id: string;
  saveId: string;
  type: string;
  refs: Record<string, string>;
  block: Record<string, unknown>;
  createdAt: Date;
}

export class SaveConflictError extends Error {
  readonly current: SaveRow;
  constructor(current: SaveRow) {
    super(`Save generation conflict for slot ${current.slot}`);
    this.name = 'SaveConflictError';
    this.current = current;
  }
}

/** Find or create the internal user for a hub identity. Race-safe via ON CONFLICT. */
export async function findOrCreateUser(
  sql: Sql,
  externalId: string,
  displayName?: string | null
): Promise<UserRow> {
  const [row] = await sql`
    insert into users (id, external_id, display_name)
    values (${crypto.randomUUID()}, ${externalId}, ${displayName ?? null})
    on conflict (external_id) do update
      set display_name = coalesce(excluded.display_name, users.display_name)
    returning id, external_id, display_name`;
  return { id: row.id, externalId: row.external_id, displayName: row.display_name };
}

const SAVE_COLUMNS = 'id, user_id, slot, engine_version, content_version, state, generation, updated_at';

function rowToSave(r: any): SaveRow {
  return {
    id: r.id,
    userId: r.user_id,
    slot: r.slot,
    engineVersion: r.engine_version,
    contentVersion: r.content_version,
    state: typeof r.state === 'string' ? JSON.parse(r.state) : r.state,
    generation: Number(r.generation),
    updatedAt: r.updated_at
  };
}

export async function listSaves(sql: Sql, userId: string): Promise<SaveMetadata[]> {
  const rows = await sql`
    select id, slot, engine_version, content_version, generation, updated_at
    from saves where user_id = ${userId} order by slot asc`;
  return rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    engineVersion: r.engine_version,
    contentVersion: r.content_version,
    generation: Number(r.generation),
    updatedAt: r.updated_at
  }));
}

export async function getSave(sql: Sql, userId: string, slot: number): Promise<SaveRow | null> {
  const rows = await sql`
    select ${sql.unsafe(SAVE_COLUMNS)} from saves
    where user_id = ${userId} and slot = ${slot}`;
  return rows.length ? rowToSave(rows[0]) : null;
}

export interface UpsertSaveInput {
  userId: string;
  slot: number;
  engineVersion: number;
  contentVersion: string;
  state: Record<string, unknown>;
  expectedGeneration?: number;
}

/**
 * Insert or update with an optimistic concurrency check (same contract as the
 * gateway): no row → insert at generation 1; matching expectedGeneration (or
 * none given) → update and bump; mismatch → SaveConflictError with the
 * current row.
 */
export async function upsertSave(sql: Sql, input: UpsertSaveInput): Promise<SaveRow> {
  const stateJson = JSON.stringify(input.state);
  return sql.begin(async (tx) => {
    const existing = await tx`
      select ${tx.unsafe(SAVE_COLUMNS)} from saves
      where user_id = ${input.userId} and slot = ${input.slot}
      for update`;

    if (existing.length === 0) {
      const [inserted] = await tx`
        insert into saves (id, user_id, slot, engine_version, content_version, state, generation, updated_at)
        values (${crypto.randomUUID()}, ${input.userId}, ${input.slot}, ${input.engineVersion},
                ${input.contentVersion}, ${stateJson}::jsonb, 1, now())
        returning ${tx.unsafe(SAVE_COLUMNS)}`;
      return rowToSave(inserted);
    }

    const current = rowToSave(existing[0]);
    if (input.expectedGeneration !== undefined && input.expectedGeneration !== current.generation) {
      throw new SaveConflictError(current);
    }

    const [updated] = await tx`
      update saves
         set engine_version = ${input.engineVersion},
             content_version = ${input.contentVersion},
             state = ${stateJson}::jsonb,
             generation = generation + 1,
             updated_at = now()
       where user_id = ${input.userId} and slot = ${input.slot}
       returning ${tx.unsafe(SAVE_COLUMNS)}`;
    return rowToSave(updated);
  }) as Promise<SaveRow>;
}

export async function deleteSave(sql: Sql, userId: string, slot: number): Promise<boolean> {
  const result = await sql`delete from saves where user_id = ${userId} and slot = ${slot}`;
  return result.count > 0;
}

function rowToBlock(r: any): NarrativeBlockRow {
  return {
    id: r.id,
    saveId: r.save_id,
    type: r.type,
    refs: typeof r.refs === 'string' ? JSON.parse(r.refs) : r.refs,
    block: typeof r.block === 'string' ? JSON.parse(r.block) : r.block,
    createdAt: r.created_at
  };
}

export async function saveNarrativeBlock(
  sql: Sql,
  input: { saveId: string; type: string; refs?: Record<string, string>; block: Record<string, unknown> }
): Promise<NarrativeBlockRow> {
  const [row] = await sql`
    insert into narrative_blocks (id, save_id, type, refs, block)
    values (${crypto.randomUUID()}, ${input.saveId}, ${input.type},
            ${JSON.stringify(input.refs ?? {})}::jsonb, ${JSON.stringify(input.block)}::jsonb)
    returning id, save_id, type, refs, block, created_at`;
  return rowToBlock(row);
}

export async function listNarrativeBlocks(
  sql: Sql,
  saveId: string,
  opts: { order?: 'asc' | 'desc'; limit?: number; types?: string[] } = {}
): Promise<NarrativeBlockRow[]> {
  const order = opts.order === 'asc' ? sql`asc` : sql`desc`;
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 500);
  const typeClause =
    opts.types && opts.types.length > 0 ? sql`and type in ${sql(opts.types)}` : sql``;
  const rows = await sql`
    select id, save_id, type, refs, block, created_at
      from narrative_blocks
     where save_id = ${saveId} ${typeClause}
     order by created_at ${order}
     limit ${limit}`;
  return rows.map(rowToBlock);
}
