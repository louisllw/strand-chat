import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

const waitForHealth = async (baseUrl: string, timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Server did not become healthy in time');
};

const registerUser = async (
  baseUrl: string,
  { username, email, password }: { username: string; email: string; password: string }
) => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  assert.equal(res.ok, true);
  const body = await res.json() as { user?: { id?: string } };
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  return { user: body.user, cookie };
};

test('conversation, message, reaction, and read flows (integration)', { skip: !shouldRun }, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for integration tests');

  const port = 3103;
  const baseUrl = `http://localhost:${port}`;
  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'integration-test-secret',
      CLIENT_ORIGIN: 'http://localhost:8080',
      NODE_ENV: 'development',
      PG_STATEMENT_TIMEOUT_MS: '30000',
    },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(baseUrl);

    const stamp = Date.now();
    const userA = {
      username: `usera${stamp}`,
      email: `usera${stamp}@example.com`,
      password: 'password123!',
    };
    const userB = {
      username: `userb${stamp}`,
      email: `userb${stamp}@example.com`,
      password: 'password123!',
    };

    const { cookie: cookieA } = await registerUser(baseUrl, userA);
    await registerUser(baseUrl, userB);

    const createConvRes = await fetch(`${baseUrl}/api/conversations/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ username: userB.username }),
    });
    assert.equal(createConvRes.ok, true);
    const { conversationId } = await createConvRes.json() as { conversationId?: string };
    assert.ok(conversationId);

    const sendRes = await fetch(`${baseUrl}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ content: 'hello from integration test' }),
    });
    assert.equal(sendRes.ok, true);
    const sendBody = await sendRes.json() as { message?: { id?: string } };
    assert.ok(sendBody.message?.id);

    const listRes = await fetch(`${baseUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Cookie: cookieA },
    });
    assert.equal(listRes.ok, true);
    const listBody = await listRes.json() as { messages?: unknown[] };
    assert.ok(Array.isArray(listBody.messages));
    assert.ok(listBody.messages.length >= 1);

    const reactionRes = await fetch(`${baseUrl}/api/messages/${sendBody.message.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ emoji: '👍' }),
    });
    assert.equal(reactionRes.ok, true);
    const reactionBody = await reactionRes.json() as { messageId?: string };
    assert.equal(reactionBody.messageId, sendBody.message.id);

    const readRes = await fetch(`${baseUrl}/api/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.equal(readRes.ok, true);
    const readBody = await readRes.json() as { ok?: boolean };
    assert.equal(readBody.ok, true);
  } finally {
    serverProcess.kill('SIGTERM');
  }
});

test('direct conversations created via /api/conversations are deduped (integration)', { skip: !shouldRun }, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for integration tests');

  const port = 3104;
  const baseUrl = `http://localhost:${port}`;
  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'integration-test-secret',
      CLIENT_ORIGIN: 'http://localhost:8080',
      NODE_ENV: 'development',
      PG_STATEMENT_TIMEOUT_MS: '30000',
    },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(baseUrl);

    const stamp = Date.now();
    const userA = {
      username: `directa${stamp}`,
      email: `directa${stamp}@example.com`,
      password: 'password123!',
    };
    const userB = {
      username: `directb${stamp}`,
      email: `directb${stamp}@example.com`,
      password: 'password123!',
    };

    const { user: userAInfo, cookie: cookieA } = await registerUser(baseUrl, userA);
    const { user: userBInfo } = await registerUser(baseUrl, userB);
    assert.ok(userAInfo?.id);
    assert.ok(userBInfo?.id);

    const createPayload = { type: 'direct', participantIds: [userBInfo.id] };
    const createRes = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify(createPayload),
    });
    assert.equal(createRes.ok, true);
    const first = await createRes.json() as { conversationId?: string };
    assert.ok(first.conversationId);

    const duplicateRes = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify(createPayload),
    });
    assert.equal(duplicateRes.ok, true);
    const second = await duplicateRes.json() as { conversationId?: string };
    assert.equal(second.conversationId, first.conversationId);
  } finally {
    serverProcess.kill('SIGTERM');
  }
});
