import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { listSaves, getSave, upsertSave, deleteSave, SaveConflictError } from './saves.js';
import { findOrCreateUser } from './users.js';
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
    // Don't closePool here — subsequent describe blocks in this file
    // share the same pool. The final teardown is at the bottom.
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

  it('upsertSave inserts a new row at generation 1 when the slot is empty', async () => {
    const row = await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { player: { name: 'New' } }
    });
    expect(row.generation).toBe(1);
    expect(row.state).toEqual({ player: { name: 'New' } });
  });

  it('upsertSave updates an existing row and bumps generation', async () => {
    const first = await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { v: 'a' }
    });
    expect(first.generation).toBe(1);

    const second = await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { v: 'b' },
      expectedGeneration: 1
    });
    expect(second.generation).toBe(2);
    expect(second.state).toEqual({ v: 'b' });
  });

  it('upsertSave throws SaveConflictError when expectedGeneration is stale', async () => {
    await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { v: 'first' }
    });

    // Simulate another client racing ahead.
    await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { v: 'second' },
      expectedGeneration: 1
    });

    // Stale client thinks they're still at generation 1.
    let caught: SaveConflictError | null = null;
    try {
      await upsertSave({
        userId: TEST_USER,
        slot: 1,
        engineVersion: 1,
        contentVersion: '2026-05-15',
        state: { v: 'stale' },
        expectedGeneration: 1
      });
    } catch (e) {
      if (e instanceof SaveConflictError) caught = e;
    }
    expect(caught).toBeInstanceOf(SaveConflictError);
    expect(caught!.current.generation).toBe(2);
    expect(caught!.current.state).toEqual({ v: 'second' });
  });

  it('upsertSave with no expectedGeneration on an existing row still updates', async () => {
    // Documents the "first write" path even when a row exists: client
    // sends no expectedGeneration → server overwrites without conflict.
    await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { v: 'a' }
    });

    const second = await upsertSave({
      userId: TEST_USER,
      slot: 1,
      engineVersion: 1,
      contentVersion: '2026-05-15',
      state: { v: 'b' }
      // no expectedGeneration
    });
    expect(second.generation).toBe(2);
    expect(second.state).toEqual({ v: 'b' });
  });

  it('deleteSave returns true on success and false when nothing was there', async () => {
    expect(await deleteSave(TEST_USER, 1)).toBe(false);
    await seedSave(TEST_USER, 1, { hi: 'doomed' });
    expect(await deleteSave(TEST_USER, 1)).toBe(true);
    expect(await getSave(TEST_USER, 1)).toBeNull();
  });

  it('deleteSave is scoped to user_id', async () => {
    await seedSave(OTHER_USER, 1, { hi: 'theirs' });
    expect(await deleteSave(TEST_USER, 1)).toBe(false);
    // Other user's row is untouched.
    expect(await getSave(OTHER_USER, 1)).not.toBeNull();
  });
});

const describeIfDbForUsers = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDbForUsers('users persistence (integration)', () => {
  const EXTERNAL_ID = 'test:users:findOrCreate';

  beforeEach(async () => {
    await query(`delete from users where external_id = $1`, [EXTERNAL_ID]);
  });

  afterAll(async () => {
    await query(`delete from users where external_id = $1`, [EXTERNAL_ID]);
    await closePool();
  });

  it('creates a user on first call, returns the same row on second', async () => {
    const first = await findOrCreateUser(EXTERNAL_ID, 'First Login');
    expect(first.externalId).toBe(EXTERNAL_ID);
    expect(first.displayName).toBe('First Login');

    const second = await findOrCreateUser(EXTERNAL_ID, 'Second Login');
    expect(second.id).toBe(first.id);
    // displayName is updated to the latest non-null value.
    expect(second.displayName).toBe('Second Login');
  });

  it('preserves the existing display name when called with null', async () => {
    await findOrCreateUser(EXTERNAL_ID, 'Original Name');
    const second = await findOrCreateUser(EXTERNAL_ID, null);
    expect(second.displayName).toBe('Original Name');
  });
});
