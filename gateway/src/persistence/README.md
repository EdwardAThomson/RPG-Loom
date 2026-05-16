# Cloud saves — local setup

Phase 4b shipped the Postgres schema and read-only API. Phase 4c added the auth abstraction, `findOrCreateUser`, and the write/delete endpoints. The web client still uses `localStorage`; Phase 4d will wire client sync on top of this.

## When you need this

You don't, unless you're working on cloud-saves features. The gateway is usable without `DATABASE_URL` — AI/narrative endpoints continue to work and `/api/saves/*` return `503 cloud_saves_unavailable`. Same when `AUTH_PROVIDER` is unset.

## Local Postgres in 60 seconds

```bash
# Start the server (adjust for your OS — this is the Debian/Ubuntu path).
sudo service postgresql start

# Create a role + database. The role/password don't have to be 'rpg' —
# any pair you can put in a connection string works.
sudo -u postgres psql -c "create user rpg with password 'rpg';"
sudo -u postgres createdb -O rpg rpg_loom

# Apply the schema.
PGPASSWORD=rpg psql -h localhost -U rpg -d rpg_loom \
  -f gateway/src/persistence/schema.sql
```

No need to seed a user any more — Phase 4c's `findOrCreateUser` provisions on first auth.

## Running the gateway with cloud saves

```bash
DATABASE_URL=postgres://rpg:rpg@localhost:5432/rpg_loom \
  AUTH_PROVIDER=dev \
  npm run dev:gateway
```

You should see:

```
[gateway] listening on http://localhost:8787
[gateway] auth provider: dev
```

Without `DATABASE_URL` or `AUTH_PROVIDER`, `/api/saves/*` returns 503; the AI endpoints still work.

### Auth providers

- `AUTH_PROVIDER=dev` — accepts any non-empty bearer token. The token text becomes the external id (`dev:alice` for `Authorization: Bearer alice`). Useful for local testing.
- `AUTH_PROVIDER=supabase` — verifies HS256 JWTs against `SUPABASE_JWT_SECRET`. Get this from your Supabase project's API settings.
- `AUTH_PROVIDER=none` — disables save endpoints entirely (they return 503).
- Unset — implicitly `dev` if `DATABASE_URL` is set, otherwise `none`.

### Exercising the API

```bash
# Register / log in. Returns { user: { id, externalId, displayName } }.
curl -s -X POST -H "Authorization: Bearer alice" \
  http://localhost:8787/api/auth/exchange | jq

# List slots (empty for a new user).
curl -s -H "Authorization: Bearer alice" \
  http://localhost:8787/api/saves | jq

# Write a save.
curl -s -X PUT -H "Authorization: Bearer alice" -H "Content-Type: application/json" \
  -d '{"engineVersion":1,"contentVersion":"2026-05-15","state":{"player":{"name":"Alice"}}}' \
  http://localhost:8787/api/saves/0 | jq

# Re-write with the wrong expectedGeneration → 409 with the current row.
curl -s -X PUT -H "Authorization: Bearer alice" -H "Content-Type: application/json" \
  -d '{"engineVersion":1,"contentVersion":"2026-05-15","state":{},"expectedGeneration":99}' \
  http://localhost:8787/api/saves/0 | jq

# Delete a slot.
curl -s -X DELETE -H "Authorization: Bearer alice" \
  http://localhost:8787/api/saves/0 | jq
```

A request without `Authorization` returns 401. Different users' saves are isolated by `user_id` server-side; one user reading another's slot gets a 404.

## Running the tests

```bash
DATABASE_URL=postgres://rpg:rpg@localhost:5432/rpg_loom \
  npm -w @rpg-loom/gateway run test
```

24 tests: 10 auth-provider unit tests run unconditionally; the 14 persistence integration tests skip silently if `DATABASE_URL` is unset.

## Migrations

There isn't a migration tool yet. `schema.sql` is idempotent (`create table if not exists`) and is the single source of truth. When the schema needs to change in a way `if not exists` can't handle, introduce `drizzle-kit` or `node-pg-migrate`.
