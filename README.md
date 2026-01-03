# Strand Chat

Self-hosted, real-time chat with Postgres + Socket.IO.

## Features

- Direct + group conversations
- Reactions, replies, typing indicators, presence
- Profiles with avatar/banner, bio, socials, website
- Message pagination (load newest, fetch older on demand)
- Unread counters cached per conversation

## Requirements

- Docker host (local machine, VPS, NAS, etc.)
- Optional: Portainer for stack UI
- Optional: domain + reverse proxy (Caddy/Nginx/Cloudflared)

## Quick start (Portainer)

1) Create a new Stack and paste this compose (matches `docker-compose.yml`):

```yaml
services:
  strand-db:
    image: louisllw/strand-chat-db:latest
    restart: unless-stopped
    environment:
      - POSTGRES_DB=strand_chat
      - POSTGRES_USER=strand
      - POSTGRES_PASSWORD
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U strand -d strand_chat"]
      interval: 10s
      timeout: 5s
      retries: 10
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.50'

  strand-redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--save", "60", "1", "--loglevel", "warning"]
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'

  strand-server:
    image: louisllw/strand-chat-server:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL
      - REDIS_URL=redis://strand-redis:6379
      - JWT_SECRET
      - TRUST_PROXY=1
      - COOKIE_NAME=strand_auth
      - CLIENT_ORIGIN=https://your.domain.com
    depends_on:
      strand-db:
        condition: service_healthy
      strand-redis:
        condition: service_started
    ports:
      - "3001:3001"
    volumes:
      - server_data:/data
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/health >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.50'

  strand-web:
    image: louisllw/strand-chat-web:latest
    restart: unless-stopped
    user: "0:0"
    depends_on:
      strand-server:
        condition: service_started
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.50'

volumes:
  db_data:
  server_data:
  redis_data:
```

2) Add this secrets block in the Stack environment variables section (or `.env` if you're using Docker Compose):

```
POSTGRES_PASSWORD=strand_password
DATABASE_URL=postgres://strand:strand_password@strand-db:5432/strand_chat
JWT_SECRET=change_me_in_production
```

Portainer accepts this `.env`-style `KEY=VALUE` format.
Keep `DATABASE_URL` in sync with `POSTGRES_PASSWORD`.
Those variables are referenced in the compose by name (`POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`).

3) Edit the non-secret values directly in the stack compose (above) as needed.

4) Deploy the stack.

Open:
- Frontend: `http://localhost:8080`
- API health: `http://localhost:3001/api/health`

Notes:
- If you are using Cloudflare Tunnel, set `CLIENT_ORIGIN` to your real domain (e.g. `https://strand.chat`).
- For local-only use, set `CLIENT_ORIGIN=http://localhost:8080`.
- For public deployments, use a strong `JWT_SECRET` and `POSTGRES_PASSWORD`.
- Resource limits are defined in `docker-compose.yml` under `deploy.resources.limits` (applies in Swarm/Portainer stacks).
- Changing `POSTGRES_PASSWORD` only affects new databases. If the `db_data` volume already exists, update the DB user password inside Postgres (or delete the volume to re-init).
- Secure cookies are auto-enabled when all `CLIENT_ORIGIN` values start with `https://`. If any origin is `http://`, cookies are non-secure for local testing.
- The bundled Caddyfile redirects HTTP to HTTPS unless the client IP is local/private. Local LAN access and `http://localhost:8080` stay accessible.
- Default behavior is: local HTTP works, and external HTTPS is handled by your proxy/tunnel.
- If using Cloudflared or another reverse proxy, set `CLIENT_ORIGIN=https://your.domain.com` and `TRUST_PROXY=1` — no Caddy changes needed.

## Quick start (Docker Compose)

1) Copy `docker-compose.yml` from the repo.
2) Create a `.env` file next to it with your secrets (required):

```
POSTGRES_PASSWORD=strand_password
DATABASE_URL=postgres://strand:strand_password@strand-db:5432/strand_chat
JWT_SECRET=change_me_in_production
```

Keep `DATABASE_URL` in sync with `POSTGRES_PASSWORD`.

3) Edit the non-secret values directly in `docker-compose.yml` as needed.

4) Start:

```
docker compose up -d
```

Open:
- Frontend: `http://localhost:8080`
- API health: `http://localhost:3001/api/health`

Notes:
- If your machine can't run the default Node 25 images, set the `platform` line in `docker-compose.yml` to match your CPU (e.g. `linux/arm64` or `linux/amd64`).
- After edits, rerun `docker compose up -d` to apply changes.

## Local dev (advanced: Node + Postgres)

Requirements:
- Node.js 18+ and npm
- Postgres 14+
- Optional: Redis 7 (only needed for caching/features that rely on Redis)

```sh
# 1) Clone and install frontend deps
git clone https://github.com/louisllw/strand-chat
cd strand-chat
npm install

# 2) Install server deps
cd server
npm install

# 3) Configure env
cp server/.env.example server/.env
# Edit server/.env with your Postgres connection + JWT secret
# If you run Redis locally, add: REDIS_URL=redis://localhost:6379
# Generate a JWT secret if you need one:
# openssl rand -hex 32

# 4) Build and initialize database (run from repo root)
cd ..
cd server
npm run build
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

If you need HTTPS locally (for service workers or clipboard APIs), use a local cert with `mkcert` and enable HTTPS in Vite.

## JWT secrets (Docker)

If `JWT_SECRET` is missing or still the default, the server auto-generates one and persists it to `/data/jwt_secret` (in the `server_data` volume).

To rotate it manually:

```
openssl rand -hex 32
```

Set the new value in your stack env (Portainer) or `.env` (Compose) and restart the `server` service.
If you previously relied on the auto-generated file, delete `/data/jwt_secret` from the `server_data` volume to force a new one on next boot.

## Environment variables

Secrets (set in Portainer stack env or `.env`):
- `POSTGRES_PASSWORD`: database password
- `DATABASE_URL`: `postgres://USER:PASSWORD@HOST:5432/DB_NAME`
- `JWT_SECRET`: random string used to sign login tokens

For local dev, use `server/.env.example` as a starting point.

Common defaults:
- `NODE_ENV`: `production` in Docker
- `PORT`: `3001`
- `TRUST_PROXY`: `1` (set to `0` if not behind a proxy)
- `COOKIE_NAME`: `strand_auth`
- `CSRF_COOKIE_NAME`: `strand_csrf`
- `REDIS_URL`: `redis://strand-redis:6379` in Docker
- `CLIENT_ORIGIN`: comma-separated list of allowed frontend URLs

Optional tuning:
- `LOG_DB_TIMINGS`: set to `true` to log per-query timings
- `PG_STATEMENT_TIMEOUT_MS`: query timeout in ms (default `5000`)
- `DB_RETRY_ATTEMPTS`: retry count for transient read errors (default `2`)
- `DB_RETRY_DELAY_MS`: base retry delay in ms (default `50`)
- `MESSAGE_READ_RETENTION_DAYS`: days to keep `message_reads` (default `30`, set `0` to disable cleanup)
- `MESSAGE_READ_CLEANUP_INTERVAL_MS`: cleanup interval in ms (default `21600000`)
- `MAX_MESSAGE_LENGTH`: max message length in chars (default `4000`)
- `MAX_ATTACHMENT_URL_LENGTH`: max attachment URL length (default `2048`)
- `MAX_DATA_URL_BYTES`: max data URL size (default `2097152`)
- `SOCKET_MESSAGE_LIMIT`: socket message limit per window (default `12`)
- `SOCKET_MESSAGE_WINDOW_MS`: window for message rate limit (default `10000`)
- `SOCKET_REACTION_LIMIT`: socket reaction limit per window (default `20`)
- `SOCKET_REACTION_WINDOW_MS`: window for reaction rate limit (default `10000`)
- `SOCKET_TYPING_LIMIT`: socket typing limit per window (default `40`)
- `SOCKET_TYPING_WINDOW_MS`: window for typing rate limit (default `10000`)

Server JSON payload limit is 10 MB (`server/index.ts`).

## Common setup issues

- `database "…" does not exist`: create the database in Postgres first, then run `server/db/init.sql`.
- `relation "users" does not exist`: you did not run `server/db/init.sql` against the correct database.
- CORS errors: make sure `CLIENT_ORIGIN` includes your frontend URL exactly (including port).
- `ECONNREFUSED /api/...`: the API server isn’t running or is on a different port.
- Docker `DATABASE_URL` host: use `strand-db` (not `localhost`) when running in Compose.

## HTTPS + reverse proxy (Caddy/Nginx/Cloudflared)

If you run behind Caddy or Nginx (optionally fronted by Cloudflared), the API and Socket.IO will work over HTTPS/WSS automatically.

Shared requirements:
- `CLIENT_ORIGIN` must match your frontend URL(s), e.g. `https://chat.example.com`
- In production, set a strong `JWT_SECRET` (or allow the Docker entrypoint to persist a generated one)
- If you terminate TLS at Cloudflare, ensure the proxy forwards `X-Forwarded-Proto` and the app trusts the proxy
- If you are behind a proxy, keep `TRUST_PROXY=1`
- For multi-instance Socket.IO deployments, see the scaling notes below

## Scaling Socket.IO (multi-instance)

Socket.IO requires either sticky sessions at the load balancer or a shared adapter (e.g., Redis) to deliver events to the right instance.

- **Sticky sessions**: ensure a client always hits the same server instance (recommended if you do not use a shared adapter).
- **Shared adapter**: use the Socket.IO Redis adapter and point all instances at the same Redis. Without this, events like `message:new` and `typing:indicator` will not reach clients connected to other instances.

If you run multiple instances in production, choose one of the options above and verify your load balancer supports WebSocket sticky sessions.

### Caddy (example)

```
chat.example.com {
  encode gzip
  reverse_proxy /api/* http://127.0.0.1:3001
  reverse_proxy /socket.io/* http://127.0.0.1:3001
  reverse_proxy http://127.0.0.1:8080
}
```

### Nginx (example)

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

### Cloudflared (example)

```
tunnel: <TUNNEL_ID>
credentials-file: /Users/you/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: chat.example.com
    service: http://127.0.0.1:8080
  - hostname: api.chat.example.com
    service: http://127.0.0.1:3001
  - service: http_status:404
```

## Database migrations (when upgrading)

Migrations live in `server/db/migrations`. The server runs them on startup by default.
To run them manually:

```
npm --prefix server run migrate
```

If you want to skip migrations for any reason, set `RUN_MIGRATIONS=false`.

## Database backups

Backup:

```
docker compose exec strand-db pg_dump -U strand strand_chat > backup.sql
```

Restore:

```
docker compose exec -T strand-db psql -U strand strand_chat < backup.sql
```

## Project structure

- `server/` Express + Socket.IO API server
- `server/db/init.sql` initial schema
- `src/` React app

## Docs

- `CONTRIBUTING.md`
- `API.md`
