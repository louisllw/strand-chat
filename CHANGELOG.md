# Changelog

## v0.0.3

- Improved mobile chat layout stability around the keyboard (fixed header, message list sizing, input anchoring).
- Locked chat viewport sizing to the visual viewport to stop page jump on iOS keyboard open.
- Ensured the message list ends at the top of the input by measuring input height and applying it to list height.
- Restored reliable scroll-to-bottom behavior on keyboard open and input focus.
- Tightened chat scroll locking to prevent page scroll bleed on touch devices.
- Updated the auth loading screen with a clean, minimal spinner.
- Cleaned up keyboard/resize listeners and observers to avoid memory leaks.
- Added contributor guidelines and API documentation.

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
