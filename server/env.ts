import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import * as webPush from 'web-push';
import { logger } from './utils/logger.js';

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

const isPlaceholder = (value?: string) => {
  if (!value) return true;
  return value === 'replace_me' || value === 'change_me_in_production';
};

const getWebPush = () => {
  const maybeDefault = webPush as unknown as { default?: typeof webPush };
  return (maybeDefault.default ?? webPush) as unknown as {
    generateVAPIDKeys: () => { publicKey: string; privateKey: string };
  };
};

const ensureVapidKeys = () => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (!isPlaceholder(process.env.VAPID_PUBLIC_KEY) && !isPlaceholder(process.env.VAPID_PRIVATE_KEY)) {
    return;
  }

  const keysPath = process.env.VAPID_KEYS_PATH || '/data/vapid.json';
  try {
    const raw = fs.readFileSync(keysPath, 'utf8');
    const parsed = JSON.parse(raw) as { publicKey?: string; privateKey?: string };
    if (parsed?.publicKey && parsed?.privateKey) {
      process.env.VAPID_PUBLIC_KEY = parsed.publicKey;
      process.env.VAPID_PRIVATE_KEY = parsed.privateKey;
      return;
    }
  } catch {
    // Ignore read/parse errors and generate new keys below.
  }

  try {
    const { publicKey, privateKey } = getWebPush().generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = publicKey;
    process.env.VAPID_PRIVATE_KEY = privateKey;
    fs.mkdirSync(path.dirname(keysPath), { recursive: true });
    fs.writeFileSync(
      keysPath,
      JSON.stringify({ publicKey, privateKey, createdAt: new Date().toISOString() }),
      'utf8'
    );
    logger.info('[push] generated VAPID keys', { keysPath });
  } catch (error) {
    logger.warn('[push] failed to generate VAPID keys', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set.');
}

if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === defaultEnv.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL === defaultEnv.DATABASE_URL) {
  logger.warn('Warning: DATABASE_URL is using the default credentials in production.');
}

ensureVapidKeys();
