import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { SupabaseAuthProvider } from './supabase.js';

const SECRET = 'test-secret-please-change-me';
const secretBytes = new TextEncoder().encode(SECRET);

async function signTestToken(payload: Record<string, any>, opts: { exp?: string } = {}): Promise<string> {
  const builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' });
  if (opts.exp !== undefined) builder.setExpirationTime(opts.exp);
  return builder.sign(secretBytes);
}

describe('SupabaseAuthProvider', () => {
  const provider = new SupabaseAuthProvider(SECRET);

  it('rejects an empty constructor secret', () => {
    expect(() => new SupabaseAuthProvider('')).toThrow();
  });

  it('verifies a well-formed HS256 token and maps sub → externalId', async () => {
    const token = await signTestToken({ sub: 'abc-123', email: 'a@b.c' }, { exp: '5m' });
    const identity = await provider.verifyToken(token);
    expect(identity).toEqual({
      externalId: 'supabase:abc-123',
      displayName: 'a@b.c'
    });
  });

  it('prefers user_metadata.display_name over email', async () => {
    const token = await signTestToken(
      { sub: 'xyz', email: 'fallback@e.com', user_metadata: { display_name: 'Hero of Veylor' } },
      { exp: '5m' }
    );
    const identity = await provider.verifyToken(token);
    expect(identity?.displayName).toBe('Hero of Veylor');
  });

  it('rejects a token signed with a different secret', async () => {
    const wrongSecret = new TextEncoder().encode('not-the-right-secret');
    const badToken = await new SignJWT({ sub: 'attacker' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(wrongSecret);

    expect(await provider.verifyToken(badToken)).toBeNull();
  });

  it('rejects an expired token', async () => {
    // exp in the past
    const token = await new SignJWT({ sub: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secretBytes);
    expect(await provider.verifyToken(token)).toBeNull();
  });

  it('rejects a token without a sub claim', async () => {
    const token = await signTestToken({ email: 'noisily@here.com' }, { exp: '5m' });
    expect(await provider.verifyToken(token)).toBeNull();
  });

  it('rejects gibberish', async () => {
    expect(await provider.verifyToken('not.a.jwt')).toBeNull();
    expect(await provider.verifyToken('')).toBeNull();
  });
});
