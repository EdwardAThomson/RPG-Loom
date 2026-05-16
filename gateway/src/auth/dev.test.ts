import { describe, it, expect } from 'vitest';
import { DevAuthProvider } from './dev.js';

describe('DevAuthProvider', () => {
  const provider = new DevAuthProvider();

  it('returns null for an empty token', async () => {
    expect(await provider.verifyToken('')).toBeNull();
    expect(await provider.verifyToken('   ')).toBeNull();
  });

  it('treats the token as the external id (with a dev: prefix)', async () => {
    const identity = await provider.verifyToken('alice');
    expect(identity).toEqual({ externalId: 'dev:alice', displayName: 'Alice' });
  });

  it('trims surrounding whitespace', async () => {
    const identity = await provider.verifyToken('  bob  ');
    expect(identity?.externalId).toBe('dev:bob');
  });
});
