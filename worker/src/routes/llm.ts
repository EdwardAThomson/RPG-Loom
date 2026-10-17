import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  rateLimit,
  bumpCounter,
  PREMIUM_DAILY_BUCKET,
  PREMIUM_DAILY_LIMITS,
  PREMIUM_DAILY_WINDOW_SECONDS
} from '../middleware/rateLimit';
import {
  AiServiceError,
  AI_QUOTA_CODE,
  FREE_MODELS,
  MEMBER_MODELS,
  generateFree,
  generateMember,
  isMemberPoolConfigured
} from '../services/ai';
import { getHubTier, tierAtLeast } from '../services/hubTier';
import { getSql, type Sql } from '../services/pg';
import type { AppEnv, Env } from '../types';

// Same contract as the local gateway's /api/llm/* so the web client works with
// either backend. Provider ids here are this Worker's pools:
//   cloudflare  Workers AI, free for every signed-in player.
//   openrouter  Members pool (Octonion membership), when OPENROUTER_API_KEY is set.
// Any other provider id (e.g. a saved 'gemini-cli' from local dev) is served by
// the free pool rather than refused.

export const FREE_PROVIDER = 'cloudflare';
export const MEMBER_PROVIDER = 'openrouter';

function providerList(env: Env) {
  const providers: Record<string, { name: string; type: 'cloud'; models: string[] }> = {
    [FREE_PROVIDER]: { name: 'Cloudflare Workers AI', type: 'cloud', models: FREE_MODELS.map((m) => m.id) }
  };
  if (isMemberPoolConfigured(env)) {
    providers[MEMBER_PROVIDER] = {
      name: 'OpenRouter (Octonion members)',
      type: 'cloud',
      models: MEMBER_MODELS.map((m) => m.id)
    };
  }
  return providers;
}

const GenerateSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  prompt: z.string().min(1).max(32_000),
  maxTokens: z.number().int().positive().max(2000).optional(),
  temperature: z.number().min(0).max(2).optional()
});

export const llmRoutes = new Hono<AppEnv>();

// Public: the web client probes this to decide whether the backend is up.
llmRoutes.get('/providers', (c) => c.json({ providers: providerList(c.env) }));

llmRoutes.post('/generate', requireAuth, rateLimit('ai-generate'), async (c) => {
  const parsed = GenerateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { provider, model, prompt, maxTokens, temperature } = parsed.data;

  // Members pool: membership + daily allowance, else quietly use the free pool.
  let fallbackReason: string | undefined;
  if (provider === MEMBER_PROVIDER) {
    const admitted = await admitToMemberPool(c.env, c.get('hubUserId'), c.get('hubJwt'), c.executionCtx);
    if (admitted === 'ok') {
      try {
        const result = await generateMember(c.env, { prompt, modelId: model, maxTokens, temperature });
        return c.json({ text: result.text, pool: 'member', model: result.modelId });
      } catch (err) {
        console.error('[llm] members pool failed; using free pool:', err instanceof Error ? err.message : err);
        fallbackReason = 'member_pool_error';
      }
    } else {
      fallbackReason = admitted;
    }
  }

  try {
    const result = await generateFree(c.env, {
      prompt,
      modelId: provider === FREE_PROVIDER ? model : undefined,
      maxTokens,
      temperature
    });
    return c.json({ text: result.text, pool: 'free', model: result.modelId, ...(fallbackReason ? { fallbackReason } : {}) });
  } catch (err) {
    if (err instanceof AiServiceError && err.code === AI_QUOTA_CODE) {
      return c.json({ error: 'The AI is out of juice for today. It resets at midnight UTC.', code: AI_QUOTA_CODE }, 503);
    }
    console.error('[llm] generation failed:', err instanceof Error ? err.message : err);
    return c.json({ error: 'AI generation failed' }, 502);
  }
});

/** 'ok', or why the caller can't use the members pool right now. */
async function admitToMemberPool(
  env: Env,
  hubUserId: string,
  jwt: string,
  ctx: { waitUntil(promise: Promise<unknown>): void }
): Promise<'ok' | 'not_member' | 'member_daily_cap' | 'member_pool_error'> {
  if (!isMemberPoolConfigured(env)) return 'member_pool_error';
  const tier = await getHubTier(env, hubUserId, jwt);
  if (!tierAtLeast(tier, 'member')) return 'not_member';

  let sql: Sql | undefined;
  try {
    sql = getSql(env);
    const { count } = await bumpCounter(sql, hubUserId, PREMIUM_DAILY_BUCKET, PREMIUM_DAILY_WINDOW_SECONDS);
    return count > (PREMIUM_DAILY_LIMITS[tier] ?? PREMIUM_DAILY_LIMITS.member) ? 'member_daily_cap' : 'ok';
  } catch (err) {
    // Counter outage: don't serve unmetered paid generations.
    console.error('[llm] members allowance check failed:', err instanceof Error ? err.message : err);
    return 'member_pool_error';
  } finally {
    if (sql) ctx.waitUntil(sql.end());
  }
}
