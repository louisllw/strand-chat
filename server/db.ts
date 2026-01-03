import pg, { type PoolClient, type QueryResult } from 'pg';
import './env.js';
import { logger } from './utils/logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 5000),
});

const shouldLogTimings = () =>
  process.env.LOG_DB_TIMINGS === 'true' && process.env.NODE_ENV !== 'production';

const RETRYABLE_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
]);
const MAX_RETRIES = Number(process.env.DB_RETRY_ATTEMPTS || 2);
const RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 50);
const CONNECT_RETRIES = Number(process.env.DB_CONNECT_RETRY_ATTEMPTS || 5);
const CONNECT_RETRY_DELAY_MS = Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 200);

const isReadOnlyQuery = (text: string) => {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith('select') || normalized.startsWith('show');
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const query = async (text: string, params?: unknown[]): Promise<QueryResult> => {
  let attempt = 0;
  while (true) {
    const start = process.hrtime.bigint();
    try {
      const result = await pool.query(text, params);
      if (shouldLogTimings()) {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const label = text?.trim()?.split(/\s+/).slice(0, 3).join(' ') || 'query';
        logger.debug('[db] query timing', { durationMs: Number(durationMs.toFixed(1)), label });
      }
      return result;
    } catch (error) {
      const errorWithCode = error as { code?: string };
      const shouldRetry = isReadOnlyQuery(text)
        && RETRYABLE_CODES.has(errorWithCode?.code || '')
        && attempt < MAX_RETRIES;
      if (!shouldRetry) {
        throw error;
      }
      attempt += 1;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
};

export const getClient = async (): Promise<PoolClient> => {
  let attempt = 0;
  while (true) {
    const start = process.hrtime.bigint();
    try {
      const client = await pool.connect();
      if (shouldLogTimings()) {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        logger.debug('[db] connect timing', { durationMs: Number(durationMs.toFixed(1)) });
      }
      return client;
    } catch (error) {
      attempt += 1;
      if (attempt > CONNECT_RETRIES) {
        throw error;
      }
      const delay = Math.min(CONNECT_RETRY_DELAY_MS * attempt, 2000);
      logger.warn('[db] connect retrying', { attempt, delay });
      await sleep(delay);
    }
  }
};

export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getClient();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    client.release();
  }
};
