import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

const waitForHealth = async (baseUrl, timeoutMs = 10000) => {
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

test('auth register/login flow (integration)', { skip: !shouldRun }, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for integration tests');

  const port = 3102;
  const baseUrl = `http://localhost:${port}`;
  const serverProcess = spawn('node', ['index.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'integration-test-secret',
      CLIENT_ORIGIN: 'http://localhost:8080',
      NODE_ENV: 'development',
    },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(baseUrl);

    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;
    const username = `test${timestamp}`;
    const password = 'password123!';

    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    assert.equal(registerRes.ok, true);
    const registerBody = await registerRes.json();
    assert.ok(registerBody.user?.id);

    const setCookie = registerRes.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assert.ok(cookie, 'auth cookie should be set on register');

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(meRes.ok, true);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(loginRes.ok, true);
  } finally {
    serverProcess.kill('SIGTERM');
  }
});
