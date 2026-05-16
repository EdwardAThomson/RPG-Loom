import { jwtVerify } from 'jose';
import type { AuthIdentity, AuthProvider } from './AuthProvider.js';

/**
 * Supabase auth provider — verifies HS256 JWTs issued by a Supabase
 * Auth project against the shared `SUPABASE_JWT_SECRET`.
 *
 * Deliberately does NOT depend on `@supabase/supabase-js` so swapping
 * to a different auth provider only requires implementing a different
 * `AuthProvider` — no SDK churn elsewhere in the gateway.
 *
 * RS256 / asymmetric verification against a JWKS endpoint would be a
 * future addition (`createRemoteJWKSet` from jose makes this easy);
 * Supabase's default is HS256 today, so that's what we ship first.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private readonly secret: Uint8Array;

  constructor(jwtSecret: string) {
    if (!jwtSecret) {
      throw new Error('SupabaseAuthProvider: jwtSecret is required');
    }
    this.secret = new TextEncoder().encode(jwtSecret);
  }

  async verifyToken(token: string): Promise<AuthIdentity | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256']
      });

      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!sub) return null;

      // Supabase puts the email in `email` and arbitrary metadata in
      // `user_metadata`. Prefer a display name, fall back to email.
      const meta = (payload as any).user_metadata ?? {};
      const displayName: string | undefined =
        (typeof meta.display_name === 'string' && meta.display_name) ||
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof payload.email === 'string' ? payload.email : undefined);

      return {
        externalId: `supabase:${sub}`,
        displayName
      };
    } catch {
      // Any verification failure (bad sig, expired, malformed) → no identity.
      return null;
    }
  }
}
