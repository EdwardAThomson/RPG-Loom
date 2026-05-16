import type { AuthProvider } from './AuthProvider.js';
import { DevAuthProvider } from './dev.js';
import { SupabaseAuthProvider } from './supabase.js';

export type { AuthIdentity, AuthProvider } from './AuthProvider.js';
export { DevAuthProvider } from './dev.js';
export { SupabaseAuthProvider } from './supabase.js';

/**
 * Pick the active auth provider from `AUTH_PROVIDER` env var.
 *
 *  - `dev` (default if `DATABASE_URL` is unset, or explicitly set):
 *      DevAuthProvider — accepts any non-empty token.
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
