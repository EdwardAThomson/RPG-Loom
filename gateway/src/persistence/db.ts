import pg from 'pg';

/**
 * Thin wrapper around the Postgres connection pool.
 *
 * If `DATABASE_URL` is not set, the pool is null and any code path that
 * needs it must check `isDbConfigured()` first. This keeps the gateway
 * usable for AI-only setups where no cloud-saves are wanted — the save
 * endpoints will return 503 and everything else continues to work.
 */

let pool: pg.Pool | null = null;

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getPool(): pg.Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Reasonable defaults for a small idle-game backend. Tune later.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
    pool.on('error', (err) => {
      console.error('[db] idle client error', err);
    });
  }
  return pool;
}

/**
 * Close the pool. Used by tests; production typically doesn't need to.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Convenience: run a query against the default pool.
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}
