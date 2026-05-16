import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { saveNarrativeBlock, listNarrativeBlocks } from './narrative.js';
import { closePool, query } from './db.js';

// Integration test — skipped when DATABASE_URL is unset (e.g. CI without DB).

const TEST_USER = '00000000-0000-0000-0000-0000000000c1';
const SAVE_A = '11111111-1111-1111-1111-1111110000c1';
const SAVE_B = '22222222-2222-2222-2222-2222220000c1';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb('narrative persistence (integration)', () => {
  beforeAll(async () => {
    await query(
      `insert into users (id, external_id, display_name) values
         ($1, 'test:narrative', 'Narrative Test')
       on conflict (id) do nothing`,
      [TEST_USER]
    );
    await query(
      `insert into saves (id, user_id, slot, engine_version, content_version, state, generation)
       values ($1, $2, 0, 1, '2026-05-15', '{}'::jsonb, 1),
              ($3, $2, 1, 1, '2026-05-15', '{}'::jsonb, 1)
       on conflict (user_id, slot) do nothing`,
      [SAVE_A, TEST_USER, SAVE_B]
    );
  });

  beforeEach(async () => {
    await query(`delete from narrative_blocks where save_id in ($1::uuid, $2::uuid)`, [SAVE_A, SAVE_B]);
  });

  afterAll(async () => {
    await query(`delete from narrative_blocks where save_id in ($1::uuid, $2::uuid)`, [SAVE_A, SAVE_B]);
    await query(`delete from saves where user_id = $1`, [TEST_USER]);
    await query(`delete from users where id = $1`, [TEST_USER]);
    await closePool();
  });

  it('saveNarrativeBlock returns the persisted row with a generated id and timestamp', async () => {
    const stored = await saveNarrativeBlock({
      saveId: SAVE_A,
      type: 'journal_entry',
      refs: { questId: 'q1' },
      block: { id: 'b1', title: 'A short tale', lines: ['line one', 'line two'], tags: ['journal'] }
    });

    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.saveId).toBe(SAVE_A);
    expect(stored.type).toBe('journal_entry');
    expect(stored.refs).toEqual({ questId: 'q1' });
    expect(stored.block.title).toBe('A short tale');
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it('listNarrativeBlocks returns entries newest-first by default', async () => {
    const first = await saveNarrativeBlock({ saveId: SAVE_A, type: 'journal_entry', block: { i: 1 } });
    // Force a perceptible time gap so ordering is unambiguous.
    await new Promise(r => setTimeout(r, 5));
    const second = await saveNarrativeBlock({ saveId: SAVE_A, type: 'journal_entry', block: { i: 2 } });

    const rows = await listNarrativeBlocks(SAVE_A);
    expect(rows[0].id).toBe(second.id);
    expect(rows[1].id).toBe(first.id);
  });

  it('listNarrativeBlocks ordered ascending puts oldest first', async () => {
    const a = await saveNarrativeBlock({ saveId: SAVE_A, type: 'rumor_feed', block: { i: 'a' } });
    await new Promise(r => setTimeout(r, 5));
    const b = await saveNarrativeBlock({ saveId: SAVE_A, type: 'rumor_feed', block: { i: 'b' } });

    const rows = await listNarrativeBlocks(SAVE_A, { order: 'asc' });
    expect(rows[0].id).toBe(a.id);
    expect(rows[1].id).toBe(b.id);
  });

  it('listNarrativeBlocks filters by type when provided', async () => {
    await saveNarrativeBlock({ saveId: SAVE_A, type: 'journal_entry', block: {} });
    await saveNarrativeBlock({ saveId: SAVE_A, type: 'rumor_feed', block: {} });
    await saveNarrativeBlock({ saveId: SAVE_A, type: 'npc_dialogue', block: {} });

    const rows = await listNarrativeBlocks(SAVE_A, { types: ['journal_entry', 'rumor_feed'] });
    expect(rows.map(r => r.type).sort()).toEqual(['journal_entry', 'rumor_feed']);
  });

  it('listNarrativeBlocks respects the limit', async () => {
    for (let i = 0; i < 4; i++) {
      await saveNarrativeBlock({ saveId: SAVE_A, type: 'journal_entry', block: { i } });
    }
    const rows = await listNarrativeBlocks(SAVE_A, { limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it('listNarrativeBlocks is scoped to save_id (one save cannot see another\'s entries)', async () => {
    await saveNarrativeBlock({ saveId: SAVE_A, type: 'journal_entry', block: { who: 'a' } });
    await saveNarrativeBlock({ saveId: SAVE_B, type: 'journal_entry', block: { who: 'b' } });

    const aRows = await listNarrativeBlocks(SAVE_A);
    const bRows = await listNarrativeBlocks(SAVE_B);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].block).toEqual({ who: 'a' });
    expect(bRows).toHaveLength(1);
    expect(bRows[0].block).toEqual({ who: 'b' });
  });

  it('deleting a save cascades to its narrative blocks', async () => {
    await saveNarrativeBlock({ saveId: SAVE_A, type: 'journal_entry', block: {} });
    await query(`delete from saves where id = $1`, [SAVE_A]);

    const remaining = await query(`select count(*) as n from narrative_blocks where save_id = $1`, [SAVE_A]);
    expect(Number(remaining.rows[0].n)).toBe(0);

    // Re-create SAVE_A for the next test's beforeEach cleanup to work cleanly.
    await query(
      `insert into saves (id, user_id, slot, engine_version, content_version, state, generation)
       values ($1, $2, 0, 1, '2026-05-15', '{}'::jsonb, 1)`,
      [SAVE_A, TEST_USER]
    );
  });
});
