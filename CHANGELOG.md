# Changelog

## v0.0.8

- Added Redis-backed active presence to improve push suppression accuracy across restarts.
- Standardized API error responses with codes and validation details.
- Tightened auth validation (JWT startup guard, stronger registration checks) and DB tuning (pool size, isolation).
- Improved profile settings UX (single notifications toggle, UK phone validation, remove image URL inputs).
- Simplified message composer UI and fixed typing/scroll behavior plus dialog overlay stacking.
- Updated push setup flow with a PWA-only enable prompt and clearer failure handling.
- Added Redis healthcheck and refreshed deployment docs.

## v0.0.7

- Added group admin management UI (manage/view members, promote/demote, system events, and removal notices).
- Changed group leave flow to keep the thread, disable input, and allow delete after leaving.
- Scoped message history to join/leave windows so new or re-added members start fresh.
- Combined chat header controls into a single panel and made toasts click-to-close with auto-dismiss.
- Hardened security defaults (explicit JWT algorithm, HSTS, CSP reporting, CSRF rate limits, IPv6-safe rate limit keys).
- Separated the landing page from the main app for strand.chat-only hosting.
- Aligned CI/runtime Node version to 25 and expanded tests/coverage scaffolding.

## v0.0.6

- Migrated server to TypeScript with strict config and updated build/test pipeline.
- Added structured logging, error codes, and safer JWT secret handling.
- Added stateful CSRF protection and auth session refresh flow.
- Added optional Redis-backed rate limits/message dedup and socket constants.
- Added cursor-based conversation pagination and OpenAPI schema updates.
- Improved API client error handling (global 401 + retries).
- Split chat context into focused providers and memoized hot paths.
- Debounced chat localStorage writes and refined message bubble rendering.
- Added typed Socket.IO event map for client handlers.
- Expanded backend/controller/service tests and frontend RTL coverage.
- Hardened Docker runtime (non-root user, resource limits) and docs updates.
- Included SQL migrations in the server image build to support auto-migrate on startup.

## v0.0.5

- Added migration runner with numbered SQL files and startup execution.
- Added backend integration tests for auth and chat flows, plus new unit tests.
- Added frontend testing with Vitest + RTL and coverage scripts.
- Improved Docker defaults and docs for Portainer, local/proxy HTTPS, and healthchecks.
- Added CSP and secure-cookie logging, plus env validation warnings.
- Renamed Docker services to `strand-web`, `strand-server`, and `strand-db`.
- Updated Docker healthchecks and defaults to be more resilient in Portainer.
- Added multi-arch Docker builds (amd64, arm64; server/db also arm/v7) for Apple Silicon and Raspberry Pi.

## v0.0.4

- Split chat context into focused providers to reduce UI re-renders.
- Added Docker-persisted JWT secret generation for one-click setups.
- Added readiness endpoint (`/api/ready`) that checks database connectivity.
- Added Helmet security headers for the API.
- Added database statement timeout and retry logic for transient read errors.
- Added Socket.IO rate limits for messages, reactions, and typing events.
- Enforced message length and attachment size limits (including data URLs).
- Added periodic cleanup/sweeps for socket connection counts and message dedup cache.
- Hardened production error logging with error IDs and reduced socket auth metadata.
- Expanded deployment documentation for Caddy, Nginx, and Cloudflared.
- Added Docker Hub images for web, server, and database, plus a Portainer-ready stack example.

## v0.0.3

- Improved mobile chat layout stability around the keyboard (fixed header, message list sizing, input anchoring).
- Locked chat viewport sizing to the visual viewport to stop page jump on iOS keyboard open.
- Ensured the message list ends at the top of the input by measuring input height and applying it to list height.
- Restored reliable scroll-to-bottom behavior on keyboard open and input focus.
- Tightened chat scroll locking to prevent page scroll bleed on touch devices.
- Updated the auth loading screen with a clean, minimal spinner.
- Cleaned up keyboard/resize listeners and observers to avoid memory leaks.
- Added contributor guidelines and API documentation.
- Backend refactor into controllers/services/models with new middleware and socket utilities.
- UI component variants and hook utilities consolidated for maintainability.
- Fixed Caddy routing so `/api` and `/socket.io` proxy correctly before static file handling.
- Standardized defaults on "strand chat" naming across Docker, env, and docs.
- Validated pagination limits to avoid invalid or unbounded queries.
- Avoided forcing users offline on login and guarded socket disconnect presence updates.
- Refused to boot in production with the default JWT secret.
- Auto-generate a JWT secret for Docker when unset/default in non-production.
- Trust the first proxy hop so rate limiting works correctly behind Caddy.
- Only connect Socket.IO after authentication to avoid unauthenticated 400s on landing.

## v0.0.2

- Removed Lovable branding and updated favicon/metadata.
- Added user profiles (avatar/banner, bio, website, socials) and public profile view.
- Added client-side avatar/banner cropping and resize.
- Added message pagination and load-older flow.
- Cached unread counts and optimized read tracking.
- Improved chat performance under message bursts.
- Mobile UX fixes for chat header, reactions, and input behavior.

## v0.0.1

- Added Postgres + Socket.IO server with auth, conversations, messages, reactions, presence, and emoji support.
- Implemented username rules, availability checks, and 7-day change limits.
- Added group chats, replies, reactions, typing indicators, and unread tracking.
- Added per-user thread deletion with history cutoff and group leave/add members.
- Improved UI/UX for chat list, message thread, reply navigation, and emoji picker.
- Added Docker Compose + Caddy setup and expanded README with self-hosting guides.
