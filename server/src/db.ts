import pg from 'pg';
import type { PoolClient } from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

const ssl = env.DATABASE_SSL === 'disable'
  ? false
  : { rejectUnauthorized: env.DATABASE_SSL === 'verify-full' };

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  statement_timeout: env.DATABASE_CONNECTION_TIMEOUT_MS,
  application_name: 'gav-api',
});

pool.on('error', error => {
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error');
});

export async function checkDatabase() {
  await pool.query('select 1');
}

export async function closeDatabase() {
  await pool.end();
}

/**
 * Every application-data query must run through this helper. The database uses
 * FORCE RLS and reads app.current_user_id in its policies, so a user id sent in
 * a request body can never grant access to another user's rows.
 */
export async function withUserContext<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Drop owner/superuser privileges before touching application data. This
    // makes FORCE RLS effective even when DATABASE_URL belongs to the migration
    // owner. Auth and schema migration queries do not use this helper.
    await client.query('set local role gavapp_app');
    await client.query("select set_config('app.current_user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
