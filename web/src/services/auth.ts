/**
 * Client-side auth abstraction. Mirrors the gateway's AuthProvider
 * interface in spirit: opaque bearer token, an `AuthIdentity` returned
 * from /api/auth/exchange.
 *
 * Octonion mode (`VITE_AUTH_PROVIDER=octonion`, the default when
 * `VITE_OCTONION_SUPABASE_URL` is set):
 *   Single sign-on through the Octonion account hub (octonion.io), the
 *   same flow DungeonGPT-JS uses:
 *     1. `signInOctonion()` sends the browser to `<hub>/auth/login`
 *        with this page as the redirect target.
 *     2. The hub signs the user in and comes back with `?token=<OTT>`
 *        (a 60s one-time token). The redirect target must be listed in
 *        the hub's `game_callbacks` table.
 *     3. `initAuth()` spots the token, trades it at `<hub>/auth/exchange`
 *        for an access/refresh token pair, and hands both to a
 *        supabase-js client pointed at the hub project, which keeps the
 *        access token refreshed.
 *     4. The access token is the bearer the gateway verifies with
 *        `OctonionAuthProvider` (AUTH_PROVIDER=octonion).
 *   supabase-js is used for its auth client only, never for data.
 *
 * Dev mode (`VITE_AUTH_PROVIDER=dev`, the default otherwise):
 *   The "token" is whatever the user types into the sign-in field.
 *   Server-side, AUTH_PROVIDER=dev maps `Bearer alice` to user
 *   `dev:alice`. Convenient for local testing without the hub.
 */

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { gatewayFetch } from './gateway';

export type AuthMode = 'dev' | 'octonion';

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

const HUB_URL = (import.meta.env.VITE_OCTONION_HUB_URL || 'https://octonion.io').replace(/\/+$/, '');
const HUB_SUPABASE_URL = import.meta.env.VITE_OCTONION_SUPABASE_URL as string | undefined;
const HUB_SUPABASE_ANON_KEY = import.meta.env.VITE_OCTONION_SUPABASE_ANON_KEY as string | undefined;

const configuredMode: AuthMode =
  (import.meta.env.VITE_AUTH_PROVIDER as AuthMode | undefined) ??
  (HUB_SUPABASE_URL ? 'octonion' : 'dev');

/** Where the hub sends the browser back to. Must be whitelisted in the hub's `game_callbacks`. */
export function getOctonionCallbackUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

let hubClient: SupabaseClient | null = null;
function getHubClient(): SupabaseClient | null {
  if (hubClient) return hubClient;
  if (!HUB_SUPABASE_URL || !HUB_SUPABASE_ANON_KEY) return null;
  hubClient = createClient(HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY);
  return hubClient;
}

// Octonion mode: the live access token, kept current by supabase-js's
// auto-refresh via onAuthStateChange. Lets getToken() stay synchronous.
let octonionAccessToken: string | null = null;

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
  if (configuredMode === 'octonion') return octonionAccessToken;
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

/** Register the bearer with the gateway and return the canonical user. */
async function exchangeWithGateway(token: string): Promise<AuthUser> {
  const res = await gatewayFetch('/api/auth/exchange', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign-in failed: ${res.status} ${body}`);
  }
  const { user } = (await res.json()) as { user: AuthUser };
  return user;
}

let initialized = false;

/**
 * Re-hydrate auth state. Call once on app boot; it'll fire
 * `onAuthChange` with the loaded state if a session exists.
 * Optimistically marks the user signed-in from the cached user without
 * re-verifying — the next protected request will surface a 401 if the
 * token has expired. In octonion mode this also completes a hub
 * redirect (`?token=`) if one is pending.
 */
export function initAuth(): void {
  if (initialized) return;
  initialized = true;

  if (configuredMode === 'octonion') {
    void initOctonion();
    return;
  }

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

async function initOctonion(): Promise<void> {
  const client = getHubClient();
  if (!client) {
    console.warn('[auth] Octonion mode needs VITE_OCTONION_SUPABASE_URL and VITE_OCTONION_SUPABASE_ANON_KEY; sign-in disabled.');
    return;
  }

  client.auth.onAuthStateChange((_event, session) => {
    octonionAccessToken = session?.access_token ?? null;
    if (!session && currentState.status === 'signed-in') {
      // Refresh failed or signed out in another tab.
      storeUser(null);
      setState({ mode: 'octonion', status: 'signed-out', user: null });
    }
  });

  const ott = takeOttFromUrl();
  if (ott) {
    await completeOctonionSignIn(client, ott);
    return;
  }

  const { data } = await client.auth.getSession();
  if (!data.session) {
    storeUser(null);
    return;
  }
  octonionAccessToken = data.session.access_token;
  await adoptSession(data.session, { optimistic: true });
}

/** Read and strip `?token=` from the address bar so a reload doesn't replay it. */
function takeOttFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return null;
  url.searchParams.delete('token');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return token;
}

async function completeOctonionSignIn(client: SupabaseClient, ott: string): Promise<void> {
  setState({ mode: 'octonion', status: 'signing-in', user: null });
  try {
    const res = await fetch(`${HUB_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ott })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Hub exchange failed (${res.status})`);
    }
    const { access_token, refresh_token } = await res.json();
    const { data, error } = await client.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) throw new Error(error?.message ?? 'No session from hub');
    octonionAccessToken = data.session.access_token;
    await adoptSession(data.session, { optimistic: false });
  } catch (e: any) {
    setState({ mode: 'octonion', status: 'error', user: null, error: e.message ?? String(e) });
  }
}

/**
 * Turn a hub session into a signed-in state. With `optimistic`, a cached
 * user is published immediately (boot path) and the gateway exchange
 * only refreshes it; a gateway that's offline leaves the cached user in
 * place, matching dev mode's behaviour.
 */
async function adoptSession(session: Session, opts: { optimistic: boolean }): Promise<void> {
  if (opts.optimistic) {
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try {
        setState({ mode: 'octonion', status: 'signed-in', user: JSON.parse(cached) as AuthUser });
      } catch {
        storeUser(null);
      }
    }
  }
  try {
    const user = await exchangeWithGateway(session.access_token);
    storeUser(user);
    setState({ mode: 'octonion', status: 'signed-in', user });
  } catch (e: any) {
    if (currentState.status !== 'signed-in') {
      setState({ mode: 'octonion', status: 'error', user: null, error: e.message ?? String(e) });
    }
  }
}

/** Octonion mode: send the browser to the hub's login page. */
export function signInOctonion(): void {
  const redirect = encodeURIComponent(getOctonionCallbackUrl());
  window.location.href = `${HUB_URL}/auth/login?redirect=${redirect}`;
}

/** Whether Octonion sign-in is configured in this build. */
export function isOctonionConfigured(): boolean {
  return !!(HUB_SUPABASE_URL && HUB_SUPABASE_ANON_KEY);
}

/**
 * Dev-mode sign-in: take whatever the user typed, register it with
 * the gateway via /api/auth/exchange, persist token + user info.
 */
export async function signInDev(token: string): Promise<AuthUser> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token must not be empty');

  setState({ ...currentState, status: 'signing-in', error: undefined });

  let user: AuthUser;
  try {
    user = await exchangeWithGateway(trimmed);
  } catch (e: any) {
    setState({ ...currentState, status: 'error', error: e.message });
    throw e;
  }

  storeToken(trimmed);
  storeUser(user);
  setState({ mode: 'dev', status: 'signed-in', user });
  return user;
}

/**
 * Sign out of this game only. The hub session on octonion.io stays, so
 * the next "Sign in" is one click.
 */
export async function signOut(): Promise<void> {
  storeToken(null);
  storeUser(null);
  octonionAccessToken = null;
  setState({ mode: configuredMode, status: 'signed-out', user: null });
  if (configuredMode === 'octonion') {
    await getHubClient()?.auth.signOut({ scope: 'local' });
  }
}
