# Contributing to Strand Chat

Thanks for your interest in contributing. This guide covers local setup, workflow, and expectations.

## Quick start

Requirements:
- Node.js 18+
- Postgres 14+

1) Install dependencies
```
npm install
cd server && npm install
```

2) Configure env
```
cp server/.env.example server/.env
```
Update `server/.env` with your local Postgres connection and a JWT secret.

3) Initialize database
```
psql "postgres://USER:PASSWORD@HOST:5432/DB_NAME" -f server/db/init.sql
```

If you are upgrading an existing database, run migrations:
```
npm --prefix server run migrate
```

4) Run the app
```
# API
cd server && npm run dev

# Web (new terminal)
cd ..
npm run dev
```

## Development workflow

- Create a feature branch: `git checkout -b your-name/short-topic`
- Keep changes focused and small when possible.
- Update `CHANGELOG.md` for user-facing changes.
- Run `npm run lint` before opening a PR.

## Project structure

- `src/` React app
- `server/` Express + Socket.IO API
- `server/db/init.sql` database schema

## Environment and secrets

- Never commit real secrets.
- Use `server/.env.example` as the template for required variables.
- If new env vars are added, update `server/.env.example` and `README.md`.

## Code style

- Keep changes readable and consistent with existing patterns.
- Avoid adding heavy abstractions without clear need.
- Prefer small, reusable UI primitives over copy-pasted markup.

## Testing

- Lint: `npm run lint`
- Build: `npm run build`
- Frontend tests: `npm test`
- Server tests: `npm --prefix server test`
- Server integration tests: `DATABASE_URL=postgres://... RUN_INTEGRATION_TESTS=true npm --prefix server run test:integration`

If you add new behavior, include a quick validation note in your PR.

## API docs

See `API.md` for REST and Socket.IO documentation.
