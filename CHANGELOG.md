# Changelog

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
