import { defineConfig } from 'vitest/config';

// Tests run the Hono app in Node (app.request) with hand-built bindings:
//   - AI: a stubbed `run`.
//   - HYPERDRIVE: a real Postgres when TEST_DATABASE_URL is set (schema from
//     gateway/src/persistence/schema.sql); DB-backed tests skip otherwise.
//   - Outbound fetch (hub entitlements, OpenRouter): stubbed per test.
//   - JWKS: a locally generated ES256 key via setKeySetForTesting.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false
  }
});
