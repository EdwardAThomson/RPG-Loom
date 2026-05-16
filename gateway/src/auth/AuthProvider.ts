/**
 * Auth provider interface.
 *
 * Implementations verify a bearer token and return an identity scoped
 * to the issuing system (e.g. a Supabase user UUID, an OAuth subject).
 * The gateway maps that external identity to its own `users.id` via
 * `findOrCreateUser` in the persistence layer.
 *
 * Keep this interface narrow on purpose: swapping Supabase Auth for
 * any other provider should only require a new implementation of this
 * file plus an env-var change. Do not leak provider-specific concepts
 * into the rest of the gateway.
 */
export interface AuthIdentity {
  /** Stable identifier from the issuing system. */
  externalId: string;
  /** Optional human-readable name; surfaced in the slot picker. */
  displayName?: string;
}

export interface AuthProvider {
  /** Verify a token. Return null for any failure mode (expired, invalid signature, missing claims). */
  verifyToken(token: string): Promise<AuthIdentity | null>;
}
