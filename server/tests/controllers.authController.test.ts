import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { register, login, csrf } from '../controllers/authController.js';
import { ServiceError } from '../utils/errors.js';

const createRes = () => {
  const res: {
    statusCode?: number;
    body?: unknown;
    cookieName?: string;
    cookieValue?: string;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
    cookie: (name: string, value: string) => void;
  } = {
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    cookie(name, value) {
      res.cookieName = name;
      res.cookieValue = value;
    },
  };
  return res;
};

test('register rejects missing fields', async () => {
  const req = { body: { username: '', email: '', password: '' } } as unknown as Request;
  const res = createRes();
  await assert.rejects(
    () => register(req, res as unknown as Response),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('login rejects missing fields', async () => {
  const req = { body: { email: '', password: '' } } as unknown as Request;
  const res = createRes();
  await assert.rejects(
    () => login(req, res as unknown as Response),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('csrf returns token and sets cookie if missing', async () => {
  const req = { cookies: {} } as unknown as Request;
  const res = createRes();
  await csrf(req, res as unknown as Response);
  assert.equal(res.cookieName, 'strand_csrf');
  assert.ok(res.cookieValue);
  assert.equal(typeof (res.body as { csrfToken?: string }).csrfToken, 'string');
});
