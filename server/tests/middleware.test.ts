import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { signToken } from '../auth.js';
import { getUserFromRequest, requireAuth } from '../middleware/auth.js';
import { ensureCsrfCookie, requireCsrf } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { ServiceError } from '../utils/errors.js';

const withEnv = (env: Record<string, string>, fn: () => void) => {
  const original = { ...process.env };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    process.env = original;
  }
};

type TestResponse = {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => TestResponse;
  cookie: (name: string, value: string) => void;
};

const createRes = (): TestResponse => {
  const res: TestResponse = {
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    cookie() {},
  };
  return res;
};

test('getUserFromRequest returns null without auth cookie', () => {
  const req = { cookies: {} } as unknown as Request;
  assert.equal(getUserFromRequest(req), null);
});

test('requireAuth sets req.user for valid token', () => {
  withEnv({ JWT_SECRET: 'test-secret' }, () => {
    const token = signToken({ userId: 'user-1' });
    const req = { cookies: { strand_auth: token } } as unknown as Request;
    const res = createRes();
    let called = false;
    requireAuth(req, res as unknown as Response, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal((req.user as { userId?: string }).userId, 'user-1');
  });
});

test('requireAuth responds 401 when missing token', () => {
  const req = { cookies: {} } as unknown as Request;
  const res = createRes();
  let called = false;
  requireAuth(req, res as unknown as Response, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('ensureCsrfCookie sets cookie when missing', () => {
  const req = { cookies: {} } as unknown as Request;
  const res = createRes();
  let cookieName = '';
  let cookieValue = '';
  res.cookie = (name, value) => {
    cookieName = name;
    cookieValue = value;
  };
  let called = false;
  ensureCsrfCookie(req, res as unknown as Response, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(cookieName, 'strand_csrf');
  assert.ok(cookieValue.length > 0);
});

test('requireCsrf allows safe methods', () => {
  const req = { method: 'GET', cookies: {}, get: () => undefined } as unknown as Request;
  const res = createRes();
  let called = false;
  requireCsrf(req, res as unknown as Response, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('requireCsrf rejects missing token', async () => {
  const req = { method: 'POST', cookies: {}, get: () => undefined } as unknown as Request;
  const res = createRes();
  await requireCsrf(req, res as unknown as Response, () => {});
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Invalid CSRF token' });
});

test('validate rejects invalid payload', () => {
  const schema = z.object({
    body: z.object({ name: z.string() }),
    params: z.object({}),
    query: z.object({}),
  });
  const req = { body: {}, params: {}, query: {} } as unknown as Request;
  const res = createRes();
  let called = false;
  validate(schema)(req, res as unknown as Response, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as { error?: string }).error, 'Invalid request');
});

test('validate passes and normalizes payload', () => {
  const schema = z.object({
    body: z.object({ name: z.string() }),
    params: z.object({}),
    query: z.object({}),
  });
  const req = { body: { name: 'ok' }, params: {}, query: {} } as unknown as Request;
  const res = createRes();
  let called = false;
  validate(schema)(req, res as unknown as Response, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.deepEqual(req.body, { name: 'ok' });
});

test('errorHandler maps ServiceError to status code', () => {
  const req = {} as unknown as Request;
  const res = createRes();
  errorHandler(new ServiceError(409, 'TEST_CONFLICT', 'Conflict'), req, res as unknown as Response, () => {});
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Conflict', code: 'TEST_CONFLICT' });
});

test('errorHandler returns 500 for unknown errors', () => {
  const req = {} as unknown as Request;
  const res = createRes();
  errorHandler(new Error('boom'), req, res as unknown as Response, () => {});
  assert.equal(res.statusCode, 500);
  assert.ok((res.body as { errorId?: string }).errorId);
});
