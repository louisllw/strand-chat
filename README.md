# Strand Messenger

## Project info

Self-hosted real-time chat with Postgres + Socket.IO.

## Step-by-step quick start (self-hosted)

Requirements:
- Node.js 18+ and npm
- Postgres 14+

```sh
# 1) Clone and install frontend deps
git clone <YOUR_GIT_URL>
cd strand-messenger
npm install

# 2) Install server deps
cd server
npm install

# 3) Configure env
cp .env.example .env
# Edit server/.env with your Postgres connection + JWT secret
# Generate a JWT secret if you need one:
# openssl rand -hex 32

# 4) Initialize database (run from repo root)
cd ..
psql "postgres://USER:PASSWORD@HOST:5432/DB_NAME" -f server/db/init.sql

# 5) Run the API (port 3001)
cd server
npm run dev

# 6) Run the frontend (from repo root, port 8080)
cd ..
npm run dev
```

Frontend proxies `/api` and `/socket.io` to `http://localhost:3001` via `vite.config.ts`.

## Environment variables

Copy `server/.env.example` to `server/.env` and update:

- `DATABASE_URL`: `postgres://USER:PASSWORD@HOST:5432/DB_NAME`
- `JWT_SECRET`: random string used to sign login tokens (keep it private)
- `CLIENT_ORIGIN`: comma-separated list of allowed frontend URLs, e.g. `http://localhost:8080,http://192.168.1.168:8080`
- `PORT`: defaults to `3001`

## Common setup issues

- `database "…" does not exist`: create the database in Postgres first, then run `server/db/init.sql`.
- `relation "users" does not exist`: you did not run `server/db/init.sql` against the correct database.
- CORS errors: make sure `CLIENT_ORIGIN` includes your frontend URL exactly (including port).
- `ECONNREFUSED /api/...`: the API server isn’t running or is on a different port.

## Database migrations (when upgrading)

If you pull updates and see missing column errors, run:

```sql
alter table conversation_members add column if not exists hidden_at timestamptz;
alter table conversation_members add column if not exists cleared_at timestamptz;
update conversation_members
set cleared_at = hidden_at
where cleared_at is null and hidden_at is not null;

alter table messages drop constraint if exists messages_type_check;
alter table messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'system'));
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Project structure

- `server/` Express + Socket.IO API server
- `server/db/init.sql` initial schema
- `src/` React app

## Production notes

- Set `CLIENT_ORIGIN` to your deployed frontend URL(s).
- Use HTTPS in production and set secure cookies.
- Auth endpoints are rate limited and JSON payloads are capped at 200 KB.

## HTTPS + reverse proxy (Caddy/Nginx/Cloudflared)

If you run behind Caddy or Nginx (and optionally Cloudflared), the API and Socket.IO will work over HTTPS/WSS automatically.

Key settings:
- `CLIENT_ORIGIN` must match your frontend URL(s), e.g. `https://chat.example.com`
- If you terminate TLS at Cloudflare, set Caddy/Nginx to trust the proxy and forward `X-Forwarded-Proto`.

### Example Caddyfile

```
chat.example.com {
  encode gzip
  reverse_proxy /api/* http://127.0.0.1:3001
  reverse_proxy /socket.io/* http://127.0.0.1:3001
  reverse_proxy http://127.0.0.1:8080
}
```

### Example Nginx

```
server {
  listen 443 ssl;
  server_name chat.example.com;

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
  }
}
```

### Cloudflared

Point Cloudflared at your local Caddy/Nginx port. TLS is handled by Cloudflare.

## Troubleshooting checklist

1) Is Postgres running and reachable from the machine?
2) Does `DATABASE_URL` point to the correct DB?
3) Did you run `server/db/init.sql` against the same DB?
4) Is the API running on `http://localhost:3001`?
5) Is the frontend running on `http://localhost:8080`?
6) Does `CLIENT_ORIGIN` match your frontend URL exactly?
