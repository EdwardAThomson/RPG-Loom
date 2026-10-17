import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { OctonionAuthProvider } from './octonion.js';

const HUB = 'https://hub.example.supabase.co';
const ISSUER = `${HUB}/auth/v1`;

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair('ES256')).privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: 'hub-key', alg: 'ES256' }] });
});

function sign(
  payload: Record<string, unknown>,
  opts: { key?: CryptoKey; iss?: string; exp?: string | number } = {}
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'hub-key' })
    .setIssuer(opts.iss ?? ISSUER)
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? privateKey);
}

describe('OctonionAuthProvider', () => {
  it('rejects an empty hub URL', () => {
    expect(() => new OctonionAuthProvider('')).toThrow();
  });

  it('verifies a hub token and maps sub → octonion:<sub>', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    const token = await sign({ sub: 'u-1', role: 'authenticated', email: 'a@b.c' });
    expect(await provider.verifyToken(token)).toEqual({
      externalId: 'octonion:u-1',
      displayName: 'a@b.c'
    });
  });

  it('accepts a trailing slash on the hub URL', async () => {
    const provider = new OctonionAuthProvider(`${HUB}/`, jwks);
    const token = await sign({ sub: 'u-1', role: 'authenticated' });
    expect((await provider.verifyToken(token))?.externalId).toBe('octonion:u-1');
  });

  it('prefers user_metadata.display_name', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    const token = await sign({
      sub: 'u-2',
      role: 'authenticated',
      email: 'x@y.z',
      user_metadata: { display_name: 'Weaver' }
    });
    expect((await provider.verifyToken(token))?.displayName).toBe('Weaver');
  });

  it('rejects a token signed by a different key', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    const token = await sign({ sub: 'x', role: 'authenticated' }, { key: otherPrivateKey });
    expect(await provider.verifyToken(token)).toBeNull();
  });

  it('rejects a token from another issuer', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    const token = await sign({ sub: 'x', role: 'authenticated' }, { iss: 'https://evil.example/auth/v1' });
    expect(await provider.verifyToken(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    const token = await sign({ sub: 'x', role: 'authenticated' }, { exp: Math.floor(Date.now() / 1000) - 60 });
    expect(await provider.verifyToken(token)).toBeNull();
  });

  it('rejects anon and service-role tokens', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    expect(await provider.verifyToken(await sign({ sub: 'x', role: 'anon' }))).toBeNull();
    expect(await provider.verifyToken(await sign({ sub: 'x', role: 'service_role' }))).toBeNull();
    expect(await provider.verifyToken(await sign({ sub: 'x' }))).toBeNull();
  });

  it('rejects a token without sub, and gibberish', async () => {
    const provider = new OctonionAuthProvider(HUB, jwks);
    expect(await provider.verifyToken(await sign({ role: 'authenticated' }))).toBeNull();
    expect(await provider.verifyToken('not.a.jwt')).toBeNull();
  });
});
