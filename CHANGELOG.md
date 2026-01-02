# Changelog

## v0.0.5

- Added migration runner with numbered SQL files and startup execution.
- Added backend integration tests for auth and chat flows, plus new unit tests.
- Added frontend testing with Vitest + RTL and coverage scripts.
- Improved Docker defaults and docs for Portainer, local/proxy HTTPS, and healthchecks.
- Added CSP and secure-cookie logging, plus env validation warnings.

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
