import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg, { type Client } from 'pg';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MIGRATION_LOCK_ID = 7267321;
const versionPattern = /^(\d+)_/;

const getMigrationVersion = (fileName: string) => {
  const match = fileName.match(versionPattern);
  if (!match) {
    throw new Error(`Migration filename must start with a numeric version: ${fileName}`);
  }
  return Number(match[1]);
};

const hashSql = (sql: string) => createHash('sha256').update(sql).digest('hex');

const connectWithRetry = async (connectionString: string, attempts: number, delayMs: number): Promise<Client> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        // ignore cleanup errors
      }
      if (i === attempts - 1) throw lastError;
      await sleep(delayMs);
    }
  }
  throw lastError;
};

const runMigrations = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run migrations.');
  }

  const attempts = Number(process.env.MIGRATION_RETRY_ATTEMPTS || 10);
  const delayMs = Number(process.env.MIGRATION_RETRY_DELAY_MS || 1000);
  const client = await connectWithRetry(databaseUrl, attempts, delayMs);

  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    await client.query('alter table schema_migrations add column if not exists version int');
    await client.query('alter table schema_migrations add column if not exists checksum text');
    await client.query(`
      update schema_migrations
      set version = (regexp_match(name, '^(\\d+)_'))[1]::int
      where version is null and name ~ '^(\\d+)_'
    `);
    await client.query('create unique index if not exists schema_migrations_version_idx on schema_migrations (version)');

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({ file, version: getMigrationVersion(file) }))
      .sort((a, b) => a.version - b.version);

    const appliedResult = await client.query('select name, version, checksum from schema_migrations');
    const appliedByName = new Map<string, { version: number | null; checksum: string | null }>();
    const appliedByVersion = new Map<number, { name: string; checksum: string | null }>();
    appliedResult.rows.forEach((row) => {
      appliedByName.set(row.name, { version: row.version, checksum: row.checksum });
      if (row.version !== null && row.version !== undefined) {
        appliedByVersion.set(row.version, { name: row.name, checksum: row.checksum });
      }
    });

    for (const { file, version } of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      if (!sql.trim()) continue;
      const checksum = hashSql(sql);
      const existingByName = appliedByName.get(file);
      const existingByVersion = appliedByVersion.get(version);

      if (existingByName || existingByVersion) {
        if (existingByName?.version !== null && existingByName?.version !== undefined && existingByName.version !== version) {
          throw new Error(`Migration version mismatch for ${file}`);
        }
        if (existingByVersion && existingByVersion.name !== file) {
          throw new Error(`Migration version ${version} already applied as ${existingByVersion.name}`);
        }
        const existingChecksum = existingByName?.checksum ?? existingByVersion?.checksum ?? null;
        if (existingChecksum && existingChecksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${file}`);
        }
        continue;
      }
      logger.info('[db] applying migration', { file });
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (name, version, checksum) values ($1, $2, $3)',
          [file, version, checksum]
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } catch {
      // ignore unlock errors
    }
    await client.end();
  }
};

runMigrations().catch((error) => {
  logger.error('[db] migration failed', { error });
  process.exit(1);
});
