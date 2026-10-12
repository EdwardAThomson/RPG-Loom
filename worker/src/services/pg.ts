import postgres from 'postgres';
import type { Env } from '../types';

// One postgres.js client per request, reaching Postgres via Cloudflare Hyperdrive
// (same pattern as DungeonGPT's cf-worker). Hyperdrive does the real pooling, so
// a small client-side `max` is fine; `fetch_types: false` skips per-query type
// introspection round trips. Callers close it with
// `c.executionCtx.waitUntil(sql.end())`.
export function getSql(env: Env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('Hyperdrive not configured');
  }
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
}

export type Sql = ReturnType<typeof getSql>;
