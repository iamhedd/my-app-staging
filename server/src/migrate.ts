import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from './db.js';
import { env } from './env.js';
import { logger } from './logger.js';

const MIGRATION_LOCK_ID = 1_948_273_611;

async function migrate() {
  const directory = resolve(process.cwd(), env.MIGRATIONS_DIR);
  const files = (await readdir(directory))
    .filter(file => /^\d+.*\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (!files.length) throw new Error(`No SQL migrations found in ${directory}`);

  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    for (const name of files) {
      const sql = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'select checksum from public.schema_migrations where name = $1',
        [name],
      );

      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration checksum mismatch: ${name}`);
        }
        continue;
      }

      logger.info({ migration: name }, 'Applying database migration');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into public.schema_migrations (name, checksum) values ($1, $2)',
          [name, checksum],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

migrate()
  .then(async () => {
    logger.info('Database migrations are up to date');
    await pool.end();
  })
  .catch(async error => {
    logger.error({ err: error }, 'Database migration failed');
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
