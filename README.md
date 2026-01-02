# Strand Chat

## Project info

Self-hosted real-time chat with Postgres + Socket.IO.

## Docs

- `CONTRIBUTING.md`
- `API.md`

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
cd strand-chat
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
docker compose up -d
```

The defaults map to:
- `POSTGRES_DB=strand_chat`
- `POSTGRES_USER=strand`
- `POSTGRES_PASSWORD=strand_password`
- `DATABASE_URL=postgres://strand:strand_password@db:5432/strand_chat`
- `JWT_SECRET=change_me_in_production`
- `COOKIE_NAME=strand_auth`
- `CLIENT_ORIGIN=http://localhost:8080,http://localhost:5173`

Warning: these defaults are for local tinkering only. If you expose the stack beyond your machine, change:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CLIENT_ORIGIN` (to your real frontend URL)
- Do not expose the stack directly on a public IP without HTTPS. Use Caddy/Nginx/Cloudflared to terminate TLS.

When running via Docker, the API container will auto-generate a `JWT_SECRET` if it is missing or left at the default, then persist it to `/data/jwt_secret` (see the `server_data` volume in `docker-compose.yml`).

### 2) Configure `server/.env`

Copy the example and update it:

```
cp server/.env.example server/.env
```

Set these values:

- `DATABASE_URL=postgres://strand:your_password@db:5432/strand_chat`
- `JWT_SECRET=<random string>`
- `CLIENT_ORIGIN=http://localhost:8080`
- `PORT=3001`

### 3) Start the stack

```
docker compose up -d
```

Open:
- Frontend: `http://localhost:8080`
- API: `http://localhost:3001`

### Portainer

In Portainer, create a new Stack and paste the contents of `docker-compose.yml`.
You can override any config in the stack editor or the stack env section.

Example Portainer stack:

```yaml
services:
  db:
    image: louisllw/strand-chat-db:latest
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-strand_chat}
      POSTGRES_USER: ${POSTGRES_USER:-strand}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-strand_password}
    volumes:
      - db_data:/var/lib/postgresql/data

  server:
    image: louisllw/strand-chat-server:latest
    restart: unless-stopped
    environment:
      PORT: ${PORT:-3001}
      DATABASE_URL: ${DATABASE_URL:-postgres://strand:strand_password@db:5432/strand_chat}
      JWT_SECRET: ${JWT_SECRET:-change_me_in_production}
      TRUST_PROXY: ${TRUST_PROXY:-1}
      COOKIE_NAME: ${COOKIE_NAME:-strand_auth}
      CLIENT_ORIGIN: ${CLIENT_ORIGIN:-http://localhost:8080}
    depends_on:
      - db
    ports:
      - "3001:3001"
    volumes:
      - server_data:/data

  web:
    image: louisllw/strand-chat-web:latest
    restart: unless-stopped
    depends_on:
      - server
    ports:
      - "8080:80"

volumes:
  db_data:
  server_data:
```

Cloudflare/Tunnel note: if you're serving the web app at `https://strand.chat`,
set `CLIENT_ORIGIN=https://strand.chat` in the stack env section so CORS matches.

## Local checks

- Lint: `npm run lint`
- Frontend build: `npm run build`
- Server tests: `node --test server/tests/*.test.js`
- Docker Compose (smoke): `docker compose up -d` then open `http://localhost:8080`

## Environment variables

Copy `server/.env.example` to `server/.env` and update:

- `DATABASE_URL`: `postgres://USER:PASSWORD@HOST:5432/DB_NAME`
- `JWT_SECRET`: random string used to sign login tokens (keep it private)
- `CLIENT_ORIGIN`: comma-separated list of allowed frontend URLs, e.g. `http://localhost:8080,http://192.168.1.168:8080`
- `PORT`: defaults to `3001`
- `TRUST_PROXY`: set to `1` when running behind Caddy/Nginx/Cloudflared (default `0` unless set)
- `LOG_DB_TIMINGS`: set to `true` to log per-query timings
- `PG_STATEMENT_TIMEOUT_MS`: query timeout in ms (default `5000`)
- `DB_RETRY_ATTEMPTS`: retry count for transient read errors (default `2`)
- `DB_RETRY_DELAY_MS`: base retry delay in ms (default `50`)
- `MAX_MESSAGE_LENGTH`: max message length in chars (default `4000`)
- `MAX_ATTACHMENT_URL_LENGTH`: max attachment URL length (default `2048`)
- `MAX_DATA_URL_BYTES`: max data URL size (default `2097152`)
- `SOCKET_MESSAGE_LIMIT`: socket message limit per window (default `12`)
- `SOCKET_MESSAGE_WINDOW_MS`: window for message rate limit (default `10000`)
- `SOCKET_REACTION_LIMIT`: socket reaction limit per window (default `20`)
- `SOCKET_REACTION_WINDOW_MS`: window for reaction rate limit (default `10000`)
- `SOCKET_TYPING_LIMIT`: socket typing limit per window (default `40`)
- `SOCKET_TYPING_WINDOW_MS`: window for typing rate limit (default `10000`)

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

## Database backups

Backup:

```
docker compose exec db pg_dump -U strand strand_chat > backup.sql
```

Restore:

```
docker compose exec -T db psql -U strand strand_chat < backup.sql
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
- Set `NODE_ENV=production` in your production environment.

## HTTPS + reverse proxy (Caddy/Nginx/Cloudflared)

If you run behind Caddy or Nginx (optionally fronted by Cloudflared), the API and Socket.IO will work over HTTPS/WSS automatically.

Shared requirements:
- `CLIENT_ORIGIN` must match your frontend URL(s), e.g. `https://chat.example.com`
- In production, set `JWT_SECRET` explicitly (or allow the Docker entrypoint to persist a generated one).
- If you terminate TLS at Cloudflare, ensure the proxy forwards `X-Forwarded-Proto` and the app trusts the proxy.

### Caddy guide

1) Point your DNS A/AAAA record for `chat.example.com` to your server.
2) Install Caddy (it will fetch and renew TLS certs automatically).
3) Save a Caddyfile like this and reload.

```
chat.example.com {
  encode gzip
  reverse_proxy /api/* http://127.0.0.1:3001
  reverse_proxy /socket.io/* http://127.0.0.1:3001
  reverse_proxy http://127.0.0.1:8080
}
```

Notes:
- Caddy handles HTTP->HTTPS redirects automatically.
- If you are behind Cloudflare, use a Caddyfile that trusts Cloudflare and forwards the `X-Forwarded-Proto` header.

### HTTPS without an external proxy/tunnel (use the bundled Caddy)

If you do not want an external reverse proxy or tunnel, you can let the built-in Caddy handle TLS directly:

1) Point DNS A/AAAA for `chat.example.com` to your server (Caddy cannot issue certs for bare IPs).
2) Update `Caddyfile` to use your domain (replace `:80` with your hostname).
3) Expose ports 80 and 443 for the `web` service in `docker-compose.yml`.
4) Set `CLIENT_ORIGIN=https://chat.example.com` and `NODE_ENV=production` in your env.

Example Caddyfile:

```
chat.example.com {
  encode gzip
  reverse_proxy /api/* http://server:3001
  reverse_proxy /socket.io/* http://server:3001
  reverse_proxy http://server:80
}
```

Example docker-compose ports:

```
web:
  ports:
    - "80:80"
    - "443:443"
```

Notes:
- This still uses the bundled Caddy as your TLS terminator, it just runs inside the container.
- Make sure ports 80 and 443 are open on the host firewall.

### Nginx guide

1) Point DNS to your server.
2) Install Nginx.
3) Obtain TLS certificates (examples use Certbot):
   - `sudo certbot --nginx -d chat.example.com`
4) Add a server block like the following.

```
server {
  listen 443 ssl;
  server_name chat.example.com;

  ssl_certificate /etc/letsencrypt/live/chat.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Notes:
- Add a separate `server { listen 80; }` block to redirect HTTP to HTTPS if you are not using Certbot's auto config.
- If using Cloudflare in front, configure Nginx to trust Cloudflare IP ranges before trusting `X-Forwarded-Proto`.

### Cloudflared guide

Cloudflared lets you expose your origin without opening port 443.

1) Install `cloudflared` and login:
   - `cloudflared tunnel login`
2) Create a tunnel and config:
   - `cloudflared tunnel create strand-chat`
3) Create a config file at `~/.cloudflared/config.yml`:

```
tunnel: <TUNNEL_ID>
credentials-file: /Users/you/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: chat.example.com
    service: http://127.0.0.1:443
  - service: http_status:404
```

4) Point DNS to the tunnel:
   - `cloudflared tunnel route dns strand-chat chat.example.com`
5) Run the tunnel:
   - `cloudflared tunnel run strand-chat`

Notes:
- Set `NODE_ENV=production`, `TRUST_PROXY=1`, `CLIENT_ORIGIN=https://chat.example.com`, and a strong `JWT_SECRET`.
- If Cloudflare terminates TLS, keep your origin proxy (Caddy/Nginx) on `http://127.0.0.1:80` instead of `:443`.
- Ensure your proxy forwards `X-Forwarded-Proto` so secure cookies behave correctly.

## Troubleshooting checklist

1) Is Postgres running and reachable from the machine?
2) Does `DATABASE_URL` point to the correct DB?
3) Did you run `server/db/init.sql` against the same DB?
4) Is the API running on `http://localhost:3001`?
5) Is the frontend running on `http://localhost:8080`?
6) Does `CLIENT_ORIGIN` match your frontend URL exactly?
