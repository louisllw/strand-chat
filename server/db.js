import pg from 'pg';
import './env.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
