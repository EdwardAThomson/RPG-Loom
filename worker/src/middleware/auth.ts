import type { Context, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AppEnv } from '../types';

// Verifies Octonion hub access tokens: ES256/RS256 signature against the hub's
// JWKS, expiry, issuer `<hub>/auth/v1`, and `role: authenticated` (anon and
// service-role keys are refused). Mirrors gateway/src/auth/octonion.ts and
// DungeonGPT's cf-worker/src/middleware/auth.ts.

// One remote key set per hub URL per isolate; jose caches keys and refetches
// on an unknown `kid`.
const keySets = new Map<string, JWTVerifyGetKey>();

/** Test hook: substitute a local key set for a hub URL. */
export function setKeySetForTesting(hubUrl: string, keys: JWTVerifyGetKey): void {
  keySets.set(normalizeHubUrl(hubUrl), keys);
}

function normalizeHubUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getKeySet(hubUrl: string): JWTVerifyGetKey {
  let keys = keySets.get(hubUrl);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${hubUrl}/auth/v1/.well-known/jwks.json`));
    keySets.set(hubUrl, keys);
  }
  return keys;
}

export interface HubIdentity {
  sub: string;
  displayName?: string;
}

export async function verifyHubToken(token: string, hubSupabaseUrl: string): Promise<HubIdentity | null> {
  const hubUrl = normalizeHubUrl(hubSupabaseUrl);
  try {
    const { payload } = await jwtVerify(token, getKeySet(hubUrl), {
      algorithms: ['ES256', 'RS256'],
      issuer: `${hubUrl}/auth/v1`
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (payload.role !== 'authenticated') return null;

    const meta = (payload as any).user_metadata ?? {};
    const displayName: string | undefined =
      (typeof meta.display_name === 'string' && meta.display_name) ||
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof payload.email === 'string' ? payload.email : undefined);
    return { sub: payload.sub, displayName };
  } catch {
    return null;
  }
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const hubUrl = c.env.OCTONION_SUPABASE_URL;
  if (!hubUrl) {
    // Fail closed: no hub configured means nobody can be authenticated.
    return c.json({ error: 'auth_unavailable', message: 'OCTONION_SUPABASE_URL is not set.' }, 503);
  }

  const header = c.req.header('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return c.json({ error: 'missing_token' }, 401);
  }

  const identity = await verifyHubToken(token, hubUrl);
  if (!identity) {
    return c.json({ error: 'invalid_token' }, 401);
  }

  c.set('hubUserId', identity.sub);
  c.set('hubJwt', token);
  if (identity.displayName) c.set('displayName', identity.displayName);
  await next();
}
