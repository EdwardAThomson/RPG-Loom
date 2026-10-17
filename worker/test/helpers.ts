import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import app from '../src/index';
import { setKeySetForTesting } from '../src/middleware/auth';
import type { Env } from '../src/types';

export const HUB = 'https://hub.test.supabase.co';
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

let privateKey: CryptoKey | undefined;

export async function setupHubKeys(): Promise<void> {
  if (privateKey) return;
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  setKeySetForTesting(HUB, createLocalJWKSet({ keys: [{ ...jwk, kid: 'k1', alg: 'ES256' }] }));
}

export async function hubToken(
  sub: string,
  claims: Record<string, unknown> = {},
  opts: { iss?: string; exp?: string | number } = {}
): Promise<string> {
  return new SignJWT({ role: 'authenticated', email: `${sub}@example.com`, ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(sub)
    .setIssuer(opts.iss ?? `${HUB}/auth/v1`)
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey!);
}

export interface FakeAi {
  calls: Array<{ model: string; input: any }>;
  respond: (model: string) => unknown;
}

export function makeEnv(overrides: Partial<Env> = {}, ai?: FakeAi): Env {
  const fakeAi = ai ?? { calls: [], respond: () => ({ response: 'stub text' }) };
  return {
    AI: {
      run: async (model: string, input: any) => {
        fakeAi.calls.push({ model, input });
        const r = fakeAi.respond(model);
        if (r instanceof Error) throw r;
        return r;
      }
    } as unknown as Ai,
    HYPERDRIVE: { connectionString: TEST_DATABASE_URL ?? '' } as Hyperdrive,
    OCTONION_SUPABASE_URL: HUB,
    ENVIRONMENT: 'test',
    ...overrides
  };
}

/** Run one request through the app, waiting for its waitUntil work (sql.end()). */
export async function call(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
  const headers = new Headers(init.headers);
  if (!headers.has('Origin')) headers.set('Origin', 'http://localhost:5173');
  const res = await app.request(path, { ...init, headers }, env, ctx as any);
  await Promise.allSettled(pending);
  return res;
}

export function authed(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return { ...init, headers };
}

/** Apply the schema and empty the tables. */
export async function resetDb(): Promise<void> {
  const sql = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const schema = readFileSync(new URL('../../gateway/src/persistence/schema.sql', import.meta.url), 'utf8');
    await sql.unsafe(schema);
    await sql`truncate narrative_blocks, saves, users, request_counters cascade`;
  } finally {
    await sql.end();
  }
}
