import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUser, loginUser } from '../services/authService.js';
import { ServiceError } from '../utils/errors.js';

test('registerUser rejects missing fields', async () => {
  await assert.rejects(
    () => registerUser({ username: '', email: '', password: '' }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('loginUser rejects missing fields', async () => {
  await assert.rejects(
    () => loginUser({ email: '', password: '' }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});
