import type { AuthIdentity, AuthProvider } from './AuthProvider.js';

/**
 * Dev auth provider — accepts any non-empty token and treats the token
 * itself as the external id. Use this for local development and tests;
 * never enable in production.
 *
 * AUTH_PROVIDER=dev selects this. Set the token to anything (e.g.
 * `Authorization: Bearer alice`) and you'll be user `dev:alice`.
 */
export class DevAuthProvider implements AuthProvider {
  async verifyToken(token: string): Promise<AuthIdentity | null> {
    const trimmed = token.trim();
    if (!trimmed) return null;
    return {
      externalId: `dev:${trimmed}`,
      displayName: trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    };
  }
}
