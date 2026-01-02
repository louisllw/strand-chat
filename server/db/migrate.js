import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async (connectionString, attempts, delayMs) => {
  let lastError;
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

  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const appliedResult = await client.query('select name from schema_migrations');
  const applied = new Set(appliedResult.rows.map((row) => row.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    if (!sql.trim()) continue;
    console.log(`[db] applying migration ${file}`);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  await client.end();
};

runMigrations().catch((error) => {
  console.error('[db] migration failed', error);
  process.exit(1);
});
