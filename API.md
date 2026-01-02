# Strand Chat API

Base URL: `http://localhost:3001/api`

Authentication is cookie-based. The API sets a signed JWT in the auth cookie on login/register.
For non-GET/HEAD/OPTIONS requests, send the CSRF token in the `x-csrf-token` header.

OpenAPI schema: `openapi.yml`.

## Auth

### POST `/auth/register`
Create an account.

Body:
```json
{ "username": "jane", "email": "jane@example.com", "password": "secret" }
```

Response:
```json
{ "user": { "id": "...", "username": "...", "email": "..." } }
```

### POST `/auth/login`
Body:
```json
{ "email": "jane@example.com", "password": "secret" }
```

Response:
```json
{ "user": { "id": "...", "username": "...", "email": "..." } }
```

### POST `/auth/logout`
Clears the auth cookie.

Response:
```json
{ "ok": true }
```

### GET `/auth/me`
Returns the authenticated user.

Response:
```json
{ "user": { "id": "...", "username": "...", "email": "..." } }
```

### POST `/auth/refresh`
Re-issues the auth cookie and returns the current user.

Response:
```json
{ "user": { "id": "...", "username": "...", "email": "..." } }
```

### GET `/auth/csrf`
Fetches a CSRF token for cookie-authenticated requests.

Response:
```json
{ "csrfToken": "..." }
```

## Users

### GET `/users/username-availability?username=NAME`
Check whether a username can be used.

Response:
```json
{ "available": true, "reason": null }
```

### PATCH `/users/me`
Update the authenticated user profile.

Body (partial):
```json
{ "bio": "...", "website": "...", "avatar": "..." }
```

Response:
```json
{ "user": { "id": "...", "username": "..." } }
```

### GET `/users/me/emoji-recents?limit=24`
Response:
```json
{ "emojis": ["😀", "✨"] }
```

### POST `/users/me/emoji-recents`
Body:
```json
{ "emoji": "✨" }
```

Response:
```json
{ "ok": true }
```

### GET `/users/:id`
Public profile for a user.

Response:
```json
{ "user": { "id": "...", "username": "...", "avatar": "...", "status": "online" } }
```

## Conversations

### GET `/conversations`
List conversations for the current user.

Response:
```json
{ "conversations": [ { "id": "...", "type": "direct", "lastMessage": { "id": "..." } } ] }
```

### GET `/conversations/:id/messages?limit=50&beforeId=MSG_ID`
Paginated messages for a conversation.

Response:
```json
{ "messages": [ { "id": "...", "content": "...", "senderId": "..." } ] }
```

### POST `/conversations/:id/messages`
Send a message.

Body:
```json
{ "content": "Hello", "type": "text", "attachmentUrl": null, "replyToId": null, "clientMessageId": "uuid" }
```

Response:
```json
{ "message": { "id": "...", "content": "Hello" } }
```

### POST `/conversations/:id/read`
Marks the conversation as read.

Response:
```json
{ "ok": true }
```

### POST `/conversations`
Create a conversation with explicit participant IDs.

Body:
```json
{ "type": "direct", "name": null, "participantIds": ["..."] }
```

Response:
```json
{ "conversationId": "..." }
```

### POST `/conversations/direct`
Create or reuse a direct conversation by username.

Body:
```json
{ "username": "jane" }
```

Response:
```json
{ "conversationId": "..." }
```

### POST `/conversations/group`
Create a group conversation.

Body:
```json
{ "name": "Project", "usernames": ["jane", "maria"] }
```

Response:
```json
{ "conversationId": "..." }
```

### POST `/conversations/:id/members`
Add members to a group conversation.

Body:
```json
{ "usernames": ["jane", "maria"] }
```

Response:
```json
{ "added": 2 }
```

### POST `/conversations/:id/leave`
Leave a conversation.

Response:
```json
{ "ok": true }
```

### DELETE `/conversations/:id`
Hide a conversation for the current user.

Response:
```json
{ "ok": true }
```

## Messages

### POST `/messages/:id/reactions`
Toggle a reaction on a message.

Body:
```json
{ "emoji": "❤️" }
```

Response:
```json
{ "messageId": "...", "reactions": [ { "emoji": "❤️", "count": 1 } ] }
```

## Health

### GET `/health`
Response:
```json
{ "ok": true }
```

### GET `/ready`
Readiness check (database connectivity).

Response:
```json
{ "ok": true }
```

## Socket.IO

Socket namespace: default (`/`). Authentication is via the auth cookie.

Client emits:
- `conversation:join` `{ conversationId }`
- `message:send` `{ conversationId, content, type, attachmentUrl, replyToId, clientMessageId }`
- `typing:start` `{ conversationId }`
- `typing:stop` `{ conversationId }`
- `reaction:toggle` `{ messageId, emoji }`
- `presence:active`
- `presence:away`

Server emits:
- `message:new` `Message`
- `reaction:update` `{ messageId, reactions }`
- `typing:indicator` `{ conversationId, userId, username }`
- `typing:stop` `{ conversationId, userId }`
- `presence:update` `{ userId, status, lastSeen }`
- `conversation:created` `{ conversationId }`
- `conversation:updated` `{ conversationId }`
- `error` `{ event, message }`

## Errors

Errors are returned as JSON with an `error` string and appropriate HTTP status codes.

Example:
```json
{
  "error": "Invalid request",
  "details": {
    "fieldErrors": { "email": ["Invalid email"] }
  }
}
```
