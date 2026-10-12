import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { getSql, type Sql } from '../services/pg';
import {
  findOrCreateUser,
  listSaves,
  getSave,
  upsertSave,
  deleteSave,
  saveNarrativeBlock,
  listNarrativeBlocks,
  SaveConflictError,
  type UserRow
} from '../services/saves';
import type { AppEnv } from '../types';

// Cloud saves + narrative store. Same paths and response shapes as the local
// gateway (gateway/src/server.ts), so the web client is backend-agnostic.

const MAX_SAVE_BYTES = 2 * 1024 * 1024; // parity with the gateway's 2mb body cap

const PutSaveReqSchema = z.object({
  engineVersion: z.number().int().nonnegative(),
  contentVersion: z.string().min(1),
  state: z.record(z.string(), z.any()),
  expectedGeneration: z.number().int().nonnegative().optional()
});

const PostNarrativeReqSchema = z.object({
  type: z.string().min(1).max(64),
  refs: z.record(z.string(), z.string()).optional(),
  block: z.record(z.string(), z.any())
});

const NarrativeQuerySchema = z.object({
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  type: z.string().optional()
});

type Handler = (c: Context<AppEnv>, sql: Sql, user: UserRow) => Promise<Response>;

/** Open a Hyperdrive client, resolve the signed-in user, run the handler, close the client. */
function withUser(handler: Handler) {
  return async (c: Context<AppEnv>) => {
    let sql: Sql;
    try {
      sql = getSql(c.env);
    } catch {
      return c.json({ error: 'cloud_saves_unavailable', message: 'Database is not configured.' }, 503);
    }
    try {
      const user = await findOrCreateUser(sql, `octonion:${c.get('hubUserId')}`, c.get('displayName'));
      return await handler(c, sql, user);
    } catch (err) {
      console.error('[saves] request failed', err);
      return c.json({ error: 'internal' }, 500);
    } finally {
      c.executionCtx.waitUntil(sql.end());
    }
  };
}

function parseSlot(c: Context<AppEnv>): number | null {
  const slot = Number.parseInt(c.req.param('slot') ?? '', 10);
  return Number.isFinite(slot) && slot >= 0 ? slot : null;
}

export const authRoutes = new Hono<AppEnv>();

// POST /api/auth/exchange: verify the hub token and ensure a users row exists.
authRoutes.post('/exchange', requireAuth, withUser(async (c, _sql, user) => c.json({ user })));

export const saveRoutes = new Hono<AppEnv>();

saveRoutes.use('*', requireAuth);
saveRoutes.use('*', rateLimit('save-write', { methods: ['POST', 'PUT', 'DELETE'] }));

saveRoutes.get('/', withUser(async (c, sql, user) => c.json({ saves: await listSaves(sql, user.id) })));

saveRoutes.get('/:slot', withUser(async (c, sql, user) => {
  const slot = parseSlot(c);
  if (slot === null) return c.json({ error: 'bad_slot' }, 400);
  const row = await getSave(sql, user.id, slot);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ save: row });
}));

saveRoutes.put('/:slot', withUser(async (c, sql, user) => {
  const slot = parseSlot(c);
  if (slot === null) return c.json({ error: 'bad_slot' }, 400);

  const raw = await c.req.text();
  if (raw.length > MAX_SAVE_BYTES) return c.json({ error: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'bad_request' }, 400);
  }
  const parsed = PutSaveReqSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.flatten() }, 400);

  try {
    const saved = await upsertSave(sql, { userId: user.id, slot, ...parsed.data });
    return c.json({ save: saved });
  } catch (err) {
    if (err instanceof SaveConflictError) {
      return c.json({ error: 'conflict', current: err.current }, 409);
    }
    throw err;
  }
}));

saveRoutes.delete('/:slot', withUser(async (c, sql, user) => {
  const slot = parseSlot(c);
  if (slot === null) return c.json({ error: 'bad_slot' }, 400);
  const deleted = await deleteSave(sql, user.id, slot);
  if (!deleted) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
}));

saveRoutes.post('/:slot/narrative', withUser(async (c, sql, user) => {
  const slot = parseSlot(c);
  if (slot === null) return c.json({ error: 'bad_slot' }, 400);
  const parsed = PostNarrativeReqSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.flatten() }, 400);
  const save = await getSave(sql, user.id, slot);
  if (!save) return c.json({ error: 'save_not_found' }, 404);
  const entry = await saveNarrativeBlock(sql, { saveId: save.id, ...parsed.data });
  return c.json({ entry });
}));

saveRoutes.get('/:slot/narrative', withUser(async (c, sql, user) => {
  const slot = parseSlot(c);
  if (slot === null) return c.json({ error: 'bad_slot' }, 400);
  const parsed = NarrativeQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.flatten() }, 400);
  const save = await getSave(sql, user.id, slot);
  if (!save) return c.json({ error: 'save_not_found' }, 404);
  const types = parsed.data.type
    ? parsed.data.type.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  const entries = await listNarrativeBlocks(sql, save.id, {
    order: parsed.data.order,
    limit: parsed.data.limit,
    types
  });
  return c.json({ entries });
}));
