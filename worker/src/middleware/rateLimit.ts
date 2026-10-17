import type { Context, Next } from 'hono';
import { getSql, type Sql } from '../services/pg';
import type { AppEnv } from '../types';

// Fixed-window rate limiting on the `request_counters` table (same mechanics as
// DungeonGPT's cf-worker/src/middleware/rateLimit.ts): one atomic upsert-increment
// per counted request. FAIL-OPEN: a counter error logs and lets the request
// through, so a DB blip never takes the game down. Must run after requireAuth.

export const RATE_LIMITS = {
  // AI calls are player-paced (quest flavour, NPC lines, adventures).
  'ai-generate': { windowSeconds: 300, limit: 30 },
  // Autosave pushes every 30 s; journal writes on quest completion.
  'save-write': { windowSeconds: 300, limit: 120 }
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/** Daily members-pool (OpenRouter) allowance, keyed by hub tier. */
export const PREMIUM_DAILY_BUCKET = 'ai-premium-daily';
export const PREMIUM_DAILY_WINDOW_SECONDS = 86_400;
export const PREMIUM_DAILY_LIMITS: Record<string, number> = { member: 200, premium: 500, elite: 500 };

/** Increment the caller's counter for the current window; returns the new count. */
export async function bumpCounter(
  sql: Sql,
  userKey: string,
  bucket: string,
  windowSeconds: number
): Promise<{ count: number; retryAfterSeconds: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = nowSec - (nowSec % windowSeconds);
  const [row] = await sql`
    insert into request_counters (user_key, bucket, window_start, count)
    values (${userKey}, ${bucket}, to_timestamp(${windowStartSec}), 1)
    on conflict (user_key, bucket, window_start)
      do update set count = request_counters.count + 1
    returning count`;
  return { count: Number(row.count), retryAfterSeconds: windowStartSec + windowSeconds - nowSec };
}

export function rateLimit(bucket: RateLimitBucket, opts: { methods?: string[] } = {}) {
  const { windowSeconds, limit } = RATE_LIMITS[bucket];
  return async (c: Context<AppEnv>, next: Next) => {
    if (opts.methods && !opts.methods.includes(c.req.method)) return next();
    const userKey = c.get('hubUserId');
    if (!userKey) return next();

    let sql: Sql | undefined;
    let over: { retryAfterSeconds: number } | null = null;
    try {
      sql = getSql(c.env);
      const { count, retryAfterSeconds } = await bumpCounter(sql, userKey, bucket, windowSeconds);
      if (count > limit) over = { retryAfterSeconds };
    } catch (err) {
      console.error(`[rate-limit] ${bucket} counter failed; allowing request:`, err instanceof Error ? err.message : err);
    } finally {
      if (sql) c.executionCtx.waitUntil(sql.end());
    }

    if (over) {
      c.header('Retry-After', String(over.retryAfterSeconds));
      return c.json({ error: 'rate_limited', retryAfterSeconds: over.retryAfterSeconds }, 429);
    }
    return next();
  };
}
