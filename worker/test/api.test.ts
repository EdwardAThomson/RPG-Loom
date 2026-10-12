import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { HUB, TEST_DATABASE_URL, setupHubKeys, hubToken, makeEnv, call, authed, resetDb } from './helpers';
import { clearHubTierCacheForTesting } from '../src/services/hubTier';

beforeAll(setupHubKeys);

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await call(makeEnv(), '/api/saves');
    expect(res.status).toBe(401);
  });

  it('rejects tokens from another issuer, expired, or non-user roles', async () => {
    const env = makeEnv();
    const bad = [
      await hubToken('u1', {}, { iss: 'https://evil.example/auth/v1' }),
      await hubToken('u1', {}, { exp: Math.floor(Date.now() / 1000) - 60 }),
      await hubToken('u1', { role: 'anon' }),
      await hubToken('u1', { role: 'service_role' }),
      'not.a.jwt'
    ];
    for (const token of bad) {
      expect((await call(env, '/api/saves', authed(token))).status).toBe(401);
    }
  });

  it('fails closed when no hub is configured', async () => {
    const res = await call(makeEnv({ OCTONION_SUPABASE_URL: undefined }), '/api/saves', authed(await hubToken('u1')));
    expect(res.status).toBe(503);
  });
});

describe('cors', () => {
  it('allows the game origins and rejects others', async () => {
    const env = makeEnv();
    const ok = await call(env, '/health', { headers: { Origin: 'https://abc123.rpg-loom.pages.dev' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://abc123.rpg-loom.pages.dev');
    const bad = await call(env, '/health', { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('llm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHubTierCacheForTesting();
  });

  it('lists the free pool publicly, and the members pool only when keyed', async () => {
    const free = await (await call(makeEnv(), '/api/llm/providers')).json() as any;
    expect(Object.keys(free.providers)).toEqual(['cloudflare']);
    const both = await (await call(makeEnv({ OPENROUTER_API_KEY: 'k' }), '/api/llm/providers')).json() as any;
    expect(Object.keys(both.providers)).toEqual(['cloudflare', 'openrouter']);
  });

  it('requires sign-in to generate', async () => {
    const res = await call(makeEnv(), '/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'cloudflare', prompt: 'hi' })
    });
    expect(res.status).toBe(401);
  });

  it('generates on the free pool, serving unknown providers there too', async () => {
    const ai = { calls: [] as any[], respond: () => ({ choices: [{ message: { content: '  {"ok":true}  ' } }] }) };
    const env = makeEnv({}, ai);
    const token = await hubToken('u-llm');
    const res = await call(env, '/api/llm/generate', authed(token, {
      method: 'POST',
      body: JSON.stringify({ provider: 'gemini-cli', model: 'gemini-3-flash-preview', prompt: 'make a quest', maxTokens: 1200 })
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ text: '{"ok":true}', pool: 'free', model: '@cf/openai/gpt-oss-120b' });
    expect(ai.calls[0].input.max_tokens).toBe(1200);
  });

  it('walks the fallback chain when a model fails', async () => {
    const ai = {
      calls: [] as any[],
      respond: (model: string) => (model === '@cf/openai/gpt-oss-120b' ? new Error('boom') : { response: 'from fallback' })
    };
    const res = await call(makeEnv({}, ai), '/api/llm/generate', authed(await hubToken('u-fb'), {
      method: 'POST',
      body: JSON.stringify({ provider: 'cloudflare', prompt: 'x' })
    }));
    expect(await res.json()).toMatchObject({ text: 'from fallback', model: '@cf/openai/gpt-oss-20b' });
  });

  it('reports the daily Workers AI quota clearly', async () => {
    const ai = { calls: [] as any[], respond: () => new Error('4006: you have used up your daily free allocation of 10,000 neurons') };
    const res = await call(makeEnv({}, ai), '/api/llm/generate', authed(await hubToken('u-q'), {
      method: 'POST',
      body: JSON.stringify({ provider: 'cloudflare', prompt: 'x' })
    }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).code).toBe('ai_quota');
    expect(ai.calls).toHaveLength(1);
  });

  it('sends non-members asking for OpenRouter to the free pool', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://octonion.io/api/me/entitlements') return Response.json({ tier: 'free' });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(makeEnv({ OPENROUTER_API_KEY: 'k' }), '/api/llm/generate', authed(await hubToken('u-free'), {
      method: 'POST',
      body: JSON.stringify({ provider: 'openrouter', prompt: 'x' })
    }));
    expect(await res.json()).toMatchObject({ pool: 'free', fallbackReason: 'not_member' });
  });

  it('treats a hub outage as free (fails closed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));
    const res = await call(makeEnv({ OPENROUTER_API_KEY: 'k' }), '/api/llm/generate', authed(await hubToken('u-out'), {
      method: 'POST',
      body: JSON.stringify({ provider: 'openrouter', prompt: 'x' })
    }));
    expect(await res.json()).toMatchObject({ pool: 'free', fallbackReason: 'not_member' });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('with Postgres', () => {
  beforeEach(resetDb);
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHubTierCacheForTesting();
  });

  const state = { player: { name: 'Ed' }, updatedAtMs: 1 };

  it('exchange creates the user once, keyed by octonion:<sub>', async () => {
    const env = makeEnv();
    const token = await hubToken('hub-1', { user_metadata: { display_name: 'Weaver' } });
    const a = (await (await call(env, '/api/auth/exchange', authed(token, { method: 'POST' }))).json()) as any;
    const b = (await (await call(env, '/api/auth/exchange', authed(token, { method: 'POST' }))).json()) as any;
    expect(a.user).toMatchObject({ externalId: 'octonion:hub-1', displayName: 'Weaver' });
    expect(b.user.id).toBe(a.user.id);
  });

  it('round-trips a save with generation conflicts', async () => {
    const env = makeEnv();
    const token = await hubToken('hub-2');
    expect((await call(env, '/api/saves/0', authed(token))).status).toBe(404);

    const put = (body: object) =>
      call(env, '/api/saves/0', authed(token, { method: 'PUT', body: JSON.stringify(body) }));

    const first = (await (await put({ engineVersion: 3, contentVersion: 'c', state })).json()) as any;
    expect(first.save).toMatchObject({ slot: 0, generation: 1, state });

    const second = await put({ engineVersion: 3, contentVersion: 'c', state: { ...state, updatedAtMs: 2 }, expectedGeneration: 1 });
    expect(((await second.json()) as any).save.generation).toBe(2);

    const stale = await put({ engineVersion: 3, contentVersion: 'c', state, expectedGeneration: 1 });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as any).current.generation).toBe(2);

    const got = (await (await call(env, '/api/saves/0', authed(token))).json()) as any;
    expect(got.save.state.updatedAtMs).toBe(2);
    const list = (await (await call(env, '/api/saves', authed(token))).json()) as any;
    expect(list.saves).toHaveLength(1);
    expect(list.saves[0].state).toBeUndefined();
  });

  it("isolates players' saves", async () => {
    const env = makeEnv();
    const alice = await hubToken('alice');
    const bob = await hubToken('bob');
    await call(env, '/api/saves/0', authed(alice, { method: 'PUT', body: JSON.stringify({ engineVersion: 3, contentVersion: 'c', state }) }));
    expect((await call(env, '/api/saves/0', authed(bob))).status).toBe(404);
    expect((await call(env, '/api/saves/0', authed(bob, { method: 'DELETE' }))).status).toBe(404);
    expect((await call(env, '/api/saves/0', authed(alice))).status).toBe(200);
  });

  it('validates bodies and slots', async () => {
    const env = makeEnv();
    const token = await hubToken('hub-3');
    expect((await call(env, '/api/saves/-1', authed(token))).status).toBe(400);
    expect((await call(env, '/api/saves/0', authed(token, { method: 'PUT', body: '{"state":1}' }))).status).toBe(400);
  });

  it('stores and filters journal entries, removed with their save', async () => {
    const env = makeEnv();
    const token = await hubToken('hub-4');
    expect((await call(env, '/api/saves/0/narrative', authed(token))).status).toBe(404);
    await call(env, '/api/saves/0', authed(token, { method: 'PUT', body: JSON.stringify({ engineVersion: 3, contentVersion: 'c', state }) }));
    for (const type of ['journal_entry', 'rumor_feed', 'journal_entry']) {
      const res = await call(env, '/api/saves/0/narrative', authed(token, {
        method: 'POST',
        body: JSON.stringify({ type, block: { title: type, lines: ['x'] } })
      }));
      expect(res.status).toBe(200);
    }
    const all = (await (await call(env, '/api/saves/0/narrative', authed(token))).json()) as any;
    expect(all.entries).toHaveLength(3);
    const filtered = (await (await call(env, '/api/saves/0/narrative?type=journal_entry&order=asc&limit=1', authed(token))).json()) as any;
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].type).toBe('journal_entry');

    await call(env, '/api/saves/0', authed(token, { method: 'DELETE' }));
    await call(env, '/api/saves/0', authed(token, { method: 'PUT', body: JSON.stringify({ engineVersion: 3, contentVersion: 'c', state }) }));
    const after = (await (await call(env, '/api/saves/0/narrative', authed(token))).json()) as any;
    expect(after.entries).toHaveLength(0);
  });

  it('rate-limits AI generation per player', async () => {
    const env = makeEnv();
    const token = await hubToken('spammer');
    const req = () => call(env, '/api/llm/generate', authed(token, { method: 'POST', body: JSON.stringify({ provider: 'cloudflare', prompt: 'x' }) }));
    for (let i = 0; i < 30; i++) expect((await req()).status).toBe(200);
    const limited = await req();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('serves members from OpenRouter, then caps them daily', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === 'https://octonion.io/api/me/entitlements') return Response.json({ tier: 'members' });
      if (url === 'https://openrouter.ai/api/v1/chat/completions') {
        return Response.json({ choices: [{ message: { content: 'member prose' } }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const env = makeEnv({ OPENROUTER_API_KEY: 'k' });
    const token = await hubToken('member-1');
    const res = await call(env, '/api/llm/generate', authed(token, { method: 'POST', body: JSON.stringify({ provider: 'openrouter', prompt: 'x' }) }));
    expect(await res.json()).toMatchObject({ text: 'member prose', pool: 'member', model: 'deepseek/deepseek-v3.2' });
    const sent = JSON.parse(String(fetchMock.mock.calls.find((c) => c[0].includes('openrouter'))![1]!.body));
    expect(sent.provider).toEqual({ only: ['deepinfra', 'digitalocean', 'venice'], allow_fallbacks: false });

    // Exhaust the daily allowance directly, then the next request falls back.
    const postgres = (await import('postgres')).default;
    const sql = postgres(TEST_DATABASE_URL!, { max: 1 });
    await sql`update request_counters set count = 200 where bucket = 'ai-premium-daily'`;
    await sql.end();
    const capped = await call(env, '/api/llm/generate', authed(token, { method: 'POST', body: JSON.stringify({ provider: 'openrouter', prompt: 'x' }) }));
    expect(await capped.json()).toMatchObject({ pool: 'free', fallbackReason: 'member_daily_cap' });
  });
});

describe('unknown routes', () => {
  it('404s with JSON', async () => {
    const res = await call(makeEnv(), '/nope');
    expect(res.status).toBe(404);
    expect(HUB).toBeTruthy();
  });
});
