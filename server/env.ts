import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const defaultEnv = {
  PORT: '3001',
  DATABASE_URL: 'postgres://strand:strand_password@db:5432/strand_chat',
  JWT_SECRET: 'change_me_in_production',
  COOKIE_NAME: 'strand_auth',
  CLIENT_ORIGIN: 'http://localhost:8080,http://localhost:5173,http://192.168.1.116:8080',
};

Object.entries(defaultEnv).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set.');
}

if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === defaultEnv.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL === defaultEnv.DATABASE_URL) {
  console.warn('Warning: DATABASE_URL is using the default credentials in production.');
}
