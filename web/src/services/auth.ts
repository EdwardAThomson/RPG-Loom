/**
 * Client-side auth abstraction. Mirrors the gateway's AuthProvider
 * interface in spirit: opaque bearer token, an `AuthIdentity` returned
 * from /api/auth/exchange.
 *
 * Dev mode (the default and the only mode shipped in Phase 4d):
 *   The "token" is whatever the user types into the sign-in field.
 *   Server-side, AUTH_PROVIDER=dev maps `Bearer alice` to user
 *   `dev:alice`. Convenient for local testing without an OAuth flow.
 *
 * Supabase mode (planned):
 *   When `VITE_AUTH_PROVIDER=supabase`, this module would use
 *   @supabase/supabase-js for OAuth and forward Supabase's JWT as the
 *   bearer token. Not implemented yet — see `signInSupabase` stub.
 */

import { gatewayFetch } from './gateway';

export type AuthMode = 'dev' | 'supabase';

export interface AuthUser {
  id: string;
  externalId: string;
  displayName: string | null;
}

export interface AuthState {
  mode: AuthMode;
  status: 'signed-out' | 'signing-in' | 'signed-in' | 'error';
  user: AuthUser | null;
  error?: string;
}

const TOKEN_KEY = 'rpg_loom_auth_token_v1';
const USER_KEY = 'rpg_loom_auth_user_v1';

const configuredMode: AuthMode =
  (import.meta.env.VITE_AUTH_PROVIDER as AuthMode | undefined) ?? 'dev';

let currentState: AuthState = {
  mode: configuredMode,
  status: 'signed-out',
  user: null
};

const listeners = new Set<(s: AuthState) => void>();

function setState(next: AuthState) {
  currentState = next;
  for (const cb of listeners) cb(next);
}

export function getAuthState(): AuthState {
  return currentState;
}

export function onAuthChange(cb: (s: AuthState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function storeUser(user: AuthUser | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

function storeToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Re-hydrate auth state from localStorage. Call once on app boot;
 * it'll fire `onAuthChange` with the loaded state if a session exists.
 * Optimistically marks the user signed-in without re-verifying — the
 * next protected request will surface a 401 if the token has expired.
 */
export function initAuth(): void {
  const token = localStorage.getItem(TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);
  if (!token || !userJson) return;
  try {
    const user = JSON.parse(userJson) as AuthUser;
    setState({ mode: configuredMode, status: 'signed-in', user });
  } catch {
    storeUser(null);
    storeToken(null);
  }
}

/**
 * Dev-mode sign-in: take whatever the user typed, register it with
 * the gateway via /api/auth/exchange, persist token + user info.
 */
export async function signInDev(token: string): Promise<AuthUser> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token must not be empty');

  setState({ ...currentState, status: 'signing-in', error: undefined });

  const res = await gatewayFetch('/api/auth/exchange', {
    method: 'POST',
    headers: { Authorization: `Bearer ${trimmed}` }
  });

  if (!res.ok) {
    const body = await res.text();
    setState({ ...currentState, status: 'error', error: `Sign-in failed: ${res.status} ${body}` });
    throw new Error(`Sign-in failed: ${res.status} ${body}`);
  }

  const { user } = (await res.json()) as { user: AuthUser };
  storeToken(trimmed);
  storeUser(user);
  setState({ mode: 'dev', status: 'signed-in', user });
  return user;
}

/**
 * Stub. Wire @supabase/supabase-js here when adopting Supabase Auth.
 * The token returned by Supabase's session is passed verbatim to the
 * gateway, which verifies it with `SupabaseAuthProvider`.
 */
export async function signInSupabase(): Promise<AuthUser> {
  throw new Error('Supabase sign-in is not implemented yet. Use dev mode (VITE_AUTH_PROVIDER=dev).');
}

export function signOut(): void {
  storeToken(null);
  storeUser(null);
  setState({ mode: configuredMode, status: 'signed-out', user: null });
}
