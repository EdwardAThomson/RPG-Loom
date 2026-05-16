import { randomUUID } from 'node:crypto';
import { query } from './db.js';

/**
 * Persistence for `narrative_blocks` — the journal/store of AI-generated
 * narrative tied to a save slot. The schema table was created in
 * Phase 4b; Phase 4e (this file) is the first real use.
 *
 * Blocks are keyed by `save_id` (not user_id). Cascading delete on the
 * saves table cleans them up automatically when a save is removed.
 */

export interface NarrativeBlockRow {
  id: string;
  saveId: string;
  type: string;
  refs: Record<string, string>;
  block: Record<string, any>; // the NarrativeBlock DTO as stored
  createdAt: Date;
}

export interface SaveNarrativeBlockInput {
  saveId: string;
  type: string;
  refs?: Record<string, string>;
  block: Record<string, any>;
}

export async function saveNarrativeBlock(input: SaveNarrativeBlockInput): Promise<NarrativeBlockRow> {
  const result = await query<{
    id: string;
    save_id: string;
    type: string;
    refs: Record<string, string>;
    block: Record<string, any>;
    created_at: Date;
  }>(
    `insert into narrative_blocks (id, save_id, type, refs, block)
     values ($1, $2, $3, $4::jsonb, $5::jsonb)
     returning id, save_id, type, refs, block, created_at`,
    [
      randomUUID(),
      input.saveId,
      input.type,
      JSON.stringify(input.refs ?? {}),
      JSON.stringify(input.block)
    ]
  );
  return rowToBlock(result.rows[0]);
}

export interface ListNarrativeBlocksOptions {
  /** Most-recent-first by default. */
  order?: 'asc' | 'desc';
  /** Cap how many to return. Default 100. */
  limit?: number;
  /** Filter to specific NarrativeBlock types (e.g. ['journal_entry']). */
  types?: string[];
}

export async function listNarrativeBlocks(
  saveId: string,
  opts: ListNarrativeBlocksOptions = {}
): Promise<NarrativeBlockRow[]> {
  const order = opts.order === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 500);

  const params: any[] = [saveId];
  let typeClause = '';
  if (opts.types && opts.types.length > 0) {
    params.push(opts.types);
    typeClause = `and type = any($${params.length}::text[])`;
  }
  params.push(limit);

  const result = await query<{
    id: string;
    save_id: string;
    type: string;
    refs: Record<string, string>;
    block: Record<string, any>;
    created_at: Date;
  }>(
    `select id, save_id, type, refs, block, created_at
       from narrative_blocks
      where save_id = $1 ${typeClause}
      order by created_at ${order}
      limit $${params.length}`,
    params
  );
  return result.rows.map(rowToBlock);
}

function rowToBlock(r: {
  id: string;
  save_id: string;
  type: string;
  refs: Record<string, string>;
  block: Record<string, any>;
  created_at: Date;
}): NarrativeBlockRow {
  return {
    id: r.id,
    saveId: r.save_id,
    type: r.type,
    refs: r.refs,
    block: r.block,
    createdAt: r.created_at
  };
}
