# rpg-loom-api (Cloudflare Worker)

RPG Loom's production backend, built the same way as DungeonGPT's `cf-worker/`:
Hono on Cloudflare Workers, Octonion hub sign-in, Postgres on the Hetzner games
box through Hyperdrive, and AI from Workers AI (free) or OpenRouter (Octonion
members). It speaks the same HTTP contract as the local `gateway/`, so the web
client only needs `VITE_GATEWAY_URL` pointed at it. The game stays fully
playable when it's unreachable.

| Route | Auth | Notes |
|---|---|---|
| `GET /health` | none | |
| `GET /api/llm/providers` | none | `cloudflare` always; `openrouter` when `OPENROUTER_API_KEY` is set |
| `POST /api/llm/generate` | hub JWT | 30 per 5 min per player. `openrouter` needs an Octonion membership (hub `/api/me/entitlements`, fails closed) and has a daily allowance (200 members, 500 premium/elite); otherwise it quietly uses the free pool. Any other provider id is served by the free pool. |
| `POST /api/auth/exchange` | hub JWT | creates the `users` row (`external_id = octonion:<sub>`) |
| `GET/PUT/DELETE /api/saves[/:slot]` | hub JWT | generation-checked writes (409 on conflict), 2 MB cap |
| `GET/POST /api/saves/:slot/narrative` | hub JWT | journal store |

Writes are rate-limited (120 per 5 min). Rate-limit counters fail open; the
members-pool allowance fails closed to the free pool.

## Develop and test

```bash
cd worker
npm install
npm run typecheck
# Tests run in Node against a real Postgres (DB tests skip without it):
TEST_DATABASE_URL=postgres://rpg:rpg@localhost:5432/rpg_loom_test npm test
```

`wrangler dev` needs `wrangler login` because the Workers AI binding is
remote-only. Point Hyperdrive at a local database (or an ssh tunnel to the box):

```bash
export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://rpg_loom:<pw>@localhost:5433/rpg_loom"
npm run dev   # http://localhost:8787
```

## One-time production setup

1. **Database on the Hetzner box** (separate database and role from DungeonGPT):

   ```bash
   ssh octonion-games
   sudo -u postgres psql -c "create role rpg_loom login password '<strong-password>';"
   sudo -u postgres psql -c "create database rpg_loom owner rpg_loom;"
   sudo -u postgres psql -c "revoke connect on database rpg_loom from public;"
   # from a checkout of this repo on the box (or pipe the file over ssh):
   psql "postgresql://rpg_loom:<pw>@localhost:5432/rpg_loom" -f gateway/src/persistence/schema.sql
   ```

   The box firewall already admits Cloudflare's IP ranges on 5432 for
   DungeonGPT's Hyperdrive, so nothing changes there. If `pg_hba.conf` lists
   databases or users explicitly, add a matching line for `rpg_loom`.

2. **Hyperdrive** (from this directory, logged in to the same Cloudflare account):

   ```bash
   npx wrangler hyperdrive create rpg-loom-db \
     --connection-string="postgresql://rpg_loom:<pw>@<box-public-ip>:5432/rpg_loom" --sslmode require
   ```

   Paste the returned id into `wrangler.toml` (`REPLACE_WITH_HYPERDRIVE_ID`).

3. **Vars and secrets:** set `OCTONION_SUPABASE_URL` in `wrangler.toml` to the
   same value as DungeonGPT's. Optionally `npx wrangler secret put OPENROUTER_API_KEY`
   for the members pool.

4. **Deploy:** `npm run deploy`. Optionally add a custom domain such as
   `api.rpg-loom.octonion.io` in the Cloudflare dashboard.

5. **Web build env (Cloudflare Pages, `rpg-loom` project):**

   ```
   VITE_GATEWAY_URL=https://rpg-loom-api.<account>.workers.dev   # or the custom domain
   VITE_OCTONION_SUPABASE_URL=<same as DungeonGPT REACT_APP_OCTONION_SUPABASE_URL>
   VITE_OCTONION_SUPABASE_ANON_KEY=<same as DungeonGPT REACT_APP_OCTONION_SUPABASE_ANON_KEY>
   ```

6. **Hub:** add `https://rpg-loom.octonion.io/` (and `http://localhost:5173/`
   for dev) to the hub's `game_callbacks` table.

7. **Backups:** DungeonGPT's `scripts/ops/backup-postgres.sh` takes `DB_NAME`;
   add a second systemd service + timer on the box running it with
   `DB_NAME=rpg_loom` (same retention and R2 offsite).

Housekeeping: `request_counters` grows by a few rows per active player per day;
prune now and then with
`delete from request_counters where window_start < now() - interval '2 days';`.
