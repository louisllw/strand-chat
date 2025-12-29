import pg from 'pg';
import './env.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const shouldLogTimings = () => process.env.LOG_DB_TIMINGS === 'true';

export const query = async (text, params) => {
  const start = process.hrtime.bigint();
  const result = await pool.query(text, params);
  if (shouldLogTimings()) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const label = text?.trim()?.split(/\s+/).slice(0, 3).join(' ') || 'query';
    console.log(`[db] ${durationMs.toFixed(1)}ms ${label}`);
  }
  return result;
};

export const getClient = async () => {
  const start = process.hrtime.bigint();
  const client = await pool.connect();
  if (shouldLogTimings()) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[db] connect ${durationMs.toFixed(1)}ms`);
  }
  return client;
};
