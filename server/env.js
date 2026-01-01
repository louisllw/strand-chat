import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const defaultEnv = {
  PORT: '3001',
  DATABASE_URL: 'postgres://strand:strand_password@db:5432/strand_messenger',
  JWT_SECRET: 'change_me_in_production',
  COOKIE_NAME: 'strand_auth',
  CLIENT_ORIGIN: 'http://localhost:8080,http://localhost:5173,http://192.168.1.116:8080',
};

Object.entries(defaultEnv).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});
