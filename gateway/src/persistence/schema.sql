-- RPG Loom cloud-saves schema (Phase 4b).
--
-- Apply with:
--   createdb rpg_loom
--   psql -d rpg_loom -f gateway/src/persistence/schema.sql
--
-- Or against an existing instance set DATABASE_URL to point at it and
-- run the same psql command. No migration tool yet — when shape changes
-- start hurting, introduce drizzle-kit or node-pg-migrate.

create table if not exists users (
  id           uuid primary key,
  external_id  text not null unique,
  display_name text,
  created_at   timestamptz not null default now()
);

create table if not exists saves (
  id              uuid primary key,
  user_id         uuid not null references users(id) on delete cascade,
  slot            int  not null,
  engine_version  int  not null,
  content_version text not null,
  state           jsonb not null,
  -- Bumped on every write; clients send their last-known generation on
  -- PUT and a stale value gets a 409. Phase 4c will wire this up.
  generation      bigint not null default 1,
  updated_at      timestamptz not null default now(),
  unique (user_id, slot)
);

create index if not exists saves_user on saves(user_id);

-- Foundation for Milestone E5 (Narrative Store) and future leaderboards.
create table if not exists narrative_blocks (
  id          uuid primary key,
  save_id     uuid not null references saves(id) on delete cascade,
  type        text not null,
  refs        jsonb not null,
  block       jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists narrative_blocks_save on narrative_blocks(save_id);
