# Cloud saves — local setup

Phase 4b ships the Postgres schema and read-only API for cloud saves. There is no auth yet (Phase 4c) and no write API (Phase 4c) — every request resolves to a single dev user.

## When you need this

You don't, unless you're working on cloud-saves features. The gateway is usable without `DATABASE_URL` — AI/narrative endpoints continue to work and `/api/saves/*` return `503 cloud_saves_unavailable`. The web client continues to use `localStorage` until Phase 4d wires it up.

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

# Seed a dev user with the UUID the gateway expects.
PGPASSWORD=rpg psql -h localhost -U rpg -d rpg_loom -c "
  insert into users (id, external_id, display_name)
  values ('00000000-0000-0000-0000-000000000001', 'dev:1', 'Dev User')
  on conflict (id) do nothing;
"
```

## Running the gateway with cloud saves

```bash
DATABASE_URL=postgres://rpg:rpg@localhost:5432/rpg_loom \
  npm run dev:gateway
```

You should see:

```
[gateway] listening on http://localhost:8787
```

(Without `DATABASE_URL` you instead get the `/api/saves endpoints will return 503` warning.)

Test the endpoints:

```bash
curl http://localhost:8787/api/saves              # → { "saves": [] }
curl http://localhost:8787/api/saves/1            # → { "error": "not_found" } (404)
```

If you also seed a save row:

```bash
PGPASSWORD=rpg psql -h localhost -U rpg -d rpg_loom -c "
  insert into saves (id, user_id, slot, engine_version, content_version, state, generation)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 1,
          1, '2026-05-15', '{\"player\":{\"name\":\"Hero\"}}'::jsonb, 1);
"
```

…then `GET /api/saves/1` returns the full row including the parsed `state` blob.

## Running the integration tests

```bash
DATABASE_URL=postgres://rpg:rpg@localhost:5432/rpg_loom \
  npm -w @rpg-loom/gateway run test
```

Tests skip silently if `DATABASE_URL` is unset — CI environments without a Postgres won't fail.

## Overriding the dev user

```bash
DATABASE_URL=... DEV_USER_ID=<some-uuid> npm run dev:gateway
```

Useful if you want multiple test identities in one database. Phase 4c replaces this with real auth.

## Migrations

There isn't a migration tool yet. `schema.sql` is idempotent (`create table if not exists`) and is the single source of truth. When the schema needs to change in a way `if not exists` can't handle, introduce `drizzle-kit` or `node-pg-migrate`.
