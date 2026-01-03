# Bugs List

- [High] Auth cookies can be set with `secure: false` in production if any `CLIENT_ORIGIN` entry is `http://...`, weakening session security on HTTPS deployments (`server/auth.ts:45`).
- [Medium] Multiple ID fields accept any non-empty string; invalid UUIDs can cause 500s instead of clean 400s (`server/routes/conversations.ts:15`, `server/routes/conversations.ts:49`, `server/routes/messages.ts:14`, `server/routes/users.ts:64`).
- [Medium] `/api/conversations` with `type: 'direct'` can create duplicate direct threads because it skips the existing-conversation check used by `/direct` (`server/services/conversationService.ts:108`).
- [Medium] CSP allows `unsafe-inline` scripts/styles in production, reducing XSS protection (`server/index.ts:56`).
- [Low] Theme is persisted as any string, so invalid values can be stored and later applied as CSS classes (`server/routes/users.ts:25`, `server/services/userService.ts:257`).
