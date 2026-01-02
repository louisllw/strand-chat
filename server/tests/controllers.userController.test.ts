import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { usernameAvailability } from '../controllers/userController.js';

const createRes = () => {
  const res: {
    body?: unknown;
    json: (payload: unknown) => typeof res;
  } = {
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

test('usernameAvailability returns invalid response for bad input', async () => {
  const req = { user: { userId: 'u1' }, query: { username: '??' } } as unknown as Request;
  const res = createRes();
  await usernameAvailability(req, res as unknown as Response);
  assert.equal((res.body as { valid?: boolean }).valid, false);
});
