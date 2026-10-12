import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthIdentity, AuthProvider } from './AuthProvider.js';

/**
 * Octonion hub auth provider — verifies access tokens issued by the
 * Octonion account hub (octonion.io), the single sign-on shared by all
 * Octonion games.
 *
 * The hub is a Supabase Auth project that signs with asymmetric keys
 * (ES256/RS256) published at `<hubUrl>/auth/v1/.well-known/jwks.json`,
 * so verification needs no shared secret. Mirrors the checks in
 * DungeonGPT-JS's `cf-worker/src/middleware/auth.ts`: signature via
 * JWKS, expiry, issuer, and `role: authenticated` (rejects anon /
 * service-role keys).
 *
 * OCTONION_SUPABASE_URL selects the hub project, e.g.
 * `https://<ref>.supabase.co`.
 */
export class OctonionAuthProvider implements AuthProvider {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;

  /**
   * @param hubSupabaseUrl Base URL of the hub's Supabase project.
   * @param keys Optional key resolver override (tests pass a local JWKS).
   */
  constructor(hubSupabaseUrl: string, keys?: JWTVerifyGetKey) {
    if (!hubSupabaseUrl) {
      throw new Error('OctonionAuthProvider: hubSupabaseUrl is required');
    }
    const base = hubSupabaseUrl.replace(/\/+$/, '');
    this.issuer = `${base}/auth/v1`;
    this.keys = keys ?? createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verifyToken(token: string): Promise<AuthIdentity | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        algorithms: ['ES256', 'RS256'],
        issuer: this.issuer
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!sub) return null;
      if (payload.role !== 'authenticated') return null;

      const meta = (payload as any).user_metadata ?? {};
      const displayName: string | undefined =
        (typeof meta.display_name === 'string' && meta.display_name) ||
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof payload.email === 'string' ? payload.email : undefined);

      return {
        externalId: `octonion:${sub}`,
        displayName
      };
    } catch {
      // Bad signature, unknown kid, expired, wrong issuer, malformed → no identity.
      return null;
    }
  }
}
