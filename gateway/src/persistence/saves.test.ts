import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { listSaves, getSave } from './saves.js';
import { closePool, query } from './db.js';

// This is an INTEGRATION test — it requires a real Postgres reachable
// via DATABASE_URL with schema.sql already applied. It skips silently
// in environments that haven't been set up (CI without a DB).
//
// To run locally:
//   sudo service postgresql start
//   sudo -u postgres psql -c "create user rpg with password 'rpg';"
//   sudo -u postgres createdb -O rpg rpg_loom
//   PGPASSWORD=rpg psql -h localhost -U rpg -d rpg_loom -f \
//     gateway/src/persistence/schema.sql
//   DATABASE_URL=postgres://rpg:rpg@localhost:5432/rpg_loom \
//     npm -w @rpg-loom/gateway exec vitest run

const TEST_USER = '00000000-0000-0000-0000-0000000000aa';
const OTHER_USER = '00000000-0000-0000-0000-0000000000bb';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb('saves persistence (integration)', () => {
  beforeAll(async () => {
    await query(
      `insert into users (id, external_id, display_name) values
         ($1, 'test:saves', 'Saves Test'),
         ($2, 'test:saves:other', 'Other Test')
       on conflict (id) do nothing`,
      [TEST_USER, OTHER_USER]
    );
  });

  beforeEach(async () => {
    await query(`delete from saves where user_id = any($1::uuid[])`, [
      [TEST_USER, OTHER_USER]
    ]);
  });

  afterAll(async () => {
    await query(`delete from saves where user_id = any($1::uuid[])`, [
      [TEST_USER, OTHER_USER]
    ]);
    await query(`delete from users where id = any($1::uuid[])`, [
      [TEST_USER, OTHER_USER]
    ]);
    await closePool();
  });

  async function seedSave(userId: string, slot: number, state: any, generation = 1) {
    await query(
      `insert into saves (id, user_id, slot, engine_version, content_version, state, generation)
       values (gen_random_uuid(), $1, $2, 1, '2026-05-15', $3::jsonb, $4)`,
      [userId, slot, JSON.stringify(state), generation]
    );
  }

  it('listSaves returns an empty array when the user has no saves', async () => {
    const rows = await listSaves(TEST_USER);
    expect(rows).toEqual([]);
  });

  it('listSaves returns metadata for every slot the user has, sorted by slot', async () => {
    await seedSave(TEST_USER, 3, { hi: 'three' });
    await seedSave(TEST_USER, 1, { hi: 'one' });
    await seedSave(TEST_USER, 2, { hi: 'two' });

    const rows = await listSaves(TEST_USER);
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      generation: 1
    });
    // Bulky state isn't returned by listSaves.
    expect((rows[0] as any).state).toBeUndefined();
  });

  it('listSaves does not leak other users\' saves', async () => {
    await seedSave(TEST_USER, 1, { hi: 'mine' });
    await seedSave(OTHER_USER, 1, { hi: 'not mine' });

    const rows = await listSaves(TEST_USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe(1);
  });

  it('getSave returns the full row including the state blob', async () => {
    await seedSave(TEST_USER, 1, { player: { name: 'Hero', level: 4 } }, 7);

    const row = await getSave(TEST_USER, 1);
    expect(row).not.toBeNull();
    expect(row!.slot).toBe(1);
    expect(row!.generation).toBe(7);
    expect(row!.state).toEqual({ player: { name: 'Hero', level: 4 } });
  });

  it('getSave returns null for an empty slot', async () => {
    const row = await getSave(TEST_USER, 99);
    expect(row).toBeNull();
  });

  it('getSave is scoped to user_id (one user cannot read another\'s slot)', async () => {
    await seedSave(OTHER_USER, 1, { hi: 'secret' });
    const row = await getSave(TEST_USER, 1);
    expect(row).toBeNull();
  });
});
