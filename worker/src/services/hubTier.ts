import type { Env } from '../types';

// The player's Octonion membership tier, read from the hub's
// GET /api/me/entitlements with the player's own (already verified) JWT.
// Trimmed from DungeonGPT's services/hubEntitlements.ts: 60 s per-user cache,
// 3 s timeout, and every failure fails CLOSED to 'free' (access never widens on
// error).

export type Tier = 'free' | 'member' | 'premium' | 'elite';

const HUB_TIER_TO_TIER: Record<string, Tier> = {
  free: 'free',
  members: 'member',
  premium: 'premium',
  elite: 'elite'
};

const TIER_RANK: Record<Tier, number> = { free: 0, member: 1, premium: 2, elite: 3 };
export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 3_000;
const cache = new Map<string, { tier: Tier; at: number }>();

export function clearHubTierCacheForTesting(): void {
  cache.clear();
}

export async function getHubTier(env: Env, userId: string, jwt: string): Promise<Tier> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tier;

  const base = (env.HUB_URL || 'https://octonion.io').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/me/entitlements`, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`hub responded HTTP ${res.status}`);
    const data = (await res.json()) as { tier?: unknown };
    const tier = typeof data?.tier === 'string' ? HUB_TIER_TO_TIER[data.tier] : undefined;
    if (!tier) throw new Error('hub returned an unusable entitlements payload');
    cache.set(userId, { tier, at: Date.now() });
    return tier;
  } catch (err) {
    console.error('[hub-tier] resolve failed, treating as free:', err instanceof Error ? err.message : err);
    return 'free';
  } finally {
    clearTimeout(timer);
  }
}
