# Strand Chat

## Project info

Self-hosted real-time chat with Postgres + Socket.IO.

## Features

- Direct + group conversations
- Reactions, replies, typing indicators, presence
- Profiles with avatar/banner, bio, socials, website
- Profile image cropping + client-side resize before upload
- Message pagination (load newest, fetch older on demand)
- Unread counters cached per conversation

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

## Docker Compose / Portainer stack

This setup runs Postgres + API + web via Docker. It also serves the frontend on port `8080`.

### Quick zero-config test

The images include sensible defaults for local testing, so you can launch the stack without any configuration:

```
docker compose up -d --build
```

The defaults map to:
- `POSTGRES_DB=strand_messenger`
- `POSTGRES_USER=strand`
- `POSTGRES_PASSWORD=strand_password`
- `DATABASE_URL=postgres://strand:strand_password@db:5432/strand_messenger`
- `JWT_SECRET=change_me_in_production`
- `COOKIE_NAME=strand_auth`
- `CLIENT_ORIGIN=http://localhost:8080,http://localhost:5173`

### 2) Configure `server/.env`

Copy the example and update it:

```
cp server/.env.example server/.env
```

Set these values:

- `DATABASE_URL=postgres://strand:your_password@db:5432/strand_messenger`
- `JWT_SECRET=<random string>`
- `CLIENT_ORIGIN=http://localhost:8080`
- `PORT=3001`

### 3) Start the stack

```
docker compose up -d --build
```

Open:
- Frontend: `http://localhost:8080`
- API: `http://localhost:3001`

### Portainer

In Portainer, create a new Stack and paste the contents of `docker-compose.yml`.
Then add the same root `.env` values in the Portainer UI (or create them in the stack env section).

## Local checks

- Lint: `npm run lint`
- Frontend build: `npm run build`
- Docker Compose (smoke): `docker compose up -d --build` then open `http://localhost:8080`

## Environment variables

Copy `server/.env.example` to `server/.env` and update:

- `DATABASE_URL`: `postgres://USER:PASSWORD@HOST:5432/DB_NAME`
- `JWT_SECRET`: random string used to sign login tokens (keep it private)
- `CLIENT_ORIGIN`: comma-separated list of allowed frontend URLs, e.g. `http://localhost:8080,http://192.168.1.168:8080`
- `PORT`: defaults to `3001`
- `LOG_DB_TIMINGS`: set to `true` to log per-query timings

Server JSON payload limit is 30 MB (`server/index.js`).

## Images and storage

- Profile avatar/banner fields store a URL or a data URL string in the `users` table.
- Uploading an image in settings performs client-side cropping and resizing, then saves the data URL.
- If you want to host media externally, replace the stored value with your CDN/storage URL.

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

alter table conversation_members add column if not exists unread_count int not null default 0;
update conversation_members cm
set unread_count = sub.unread_count
from (
  select m.conversation_id, m.user_id, count(*)::int as unread_count
  from messages m
  join conversation_members cm2 on cm2.conversation_id = m.conversation_id
  where cm2.user_id = m.user_id
    and cm2.hidden_at is null
  group by m.conversation_id, m.user_id
) sub
where cm.conversation_id = sub.conversation_id and cm.user_id = sub.user_id;

alter table users add column if not exists phone text;
alter table users add column if not exists bio text;
alter table users add column if not exists banner_url text;
alter table users add column if not exists website_url text;
alter table users add column if not exists social_x text;
alter table users add column if not exists social_instagram text;
alter table users add column if not exists social_linkedin text;
alter table users add column if not exists social_tiktok text;
alter table users add column if not exists social_youtube text;
alter table users add column if not exists social_facebook text;
alter table users add column if not exists social_github text;

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

## Performance notes

- Conversations are fetched with last message only; messages are paged (default 50).
- Unread counts are cached in `conversation_members.unread_count`.
- Client batches incoming messages to reduce UI lag during spikes.

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
