import type { AuthProvider } from './AuthProvider.js';
import { DevAuthProvider } from './dev.js';
import { SupabaseAuthProvider } from './supabase.js';
import { OctonionAuthProvider } from './octonion.js';

export type { AuthIdentity, AuthProvider } from './AuthProvider.js';
export { DevAuthProvider } from './dev.js';
export { SupabaseAuthProvider } from './supabase.js';
export { OctonionAuthProvider } from './octonion.js';

/**
 * Pick the active auth provider from `AUTH_PROVIDER` env var.
 *
 *  - `dev` (default if `DATABASE_URL` is unset, or explicitly set):
 *      DevAuthProvider — accepts any non-empty token.
 *  - `octonion`:
 *      OctonionAuthProvider — Octonion hub SSO (octonion.io). Requires
 *      `OCTONION_SUPABASE_URL`; keys come from the hub's JWKS endpoint.
 *  - `supabase`:
 *      SupabaseAuthProvider — requires `SUPABASE_JWT_SECRET`.
 *  - `none`:
 *      Returns null. Callers should treat save endpoints as disabled.
 *
 * Returning null is distinct from throwing: it lets the gateway boot
 * with auth disabled in dev environments where DATABASE_URL is also
 * unset (the save endpoints already 503 in that case).
 */
export function selectAuthProvider(): AuthProvider | null {
  const choice = (process.env.AUTH_PROVIDER ?? '').toLowerCase();

  switch (choice) {
    case 'octonion': {
      const hubUrl = process.env.OCTONION_SUPABASE_URL;
      if (!hubUrl) {
        throw new Error('AUTH_PROVIDER=octonion requires OCTONION_SUPABASE_URL');
      }
      return new OctonionAuthProvider(hubUrl);
    }
    case 'supabase': {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) {
        throw new Error('AUTH_PROVIDER=supabase requires SUPABASE_JWT_SECRET');
      }
      return new SupabaseAuthProvider(secret);
    }
    case 'dev':
      return new DevAuthProvider();
    case 'none':
      return null;
    case '':
      // Implicit default: dev if cloud-saves are configured, none otherwise.
      return process.env.DATABASE_URL ? new DevAuthProvider() : null;
    default:
      throw new Error(`Unknown AUTH_PROVIDER: ${choice}`);
  }
}
