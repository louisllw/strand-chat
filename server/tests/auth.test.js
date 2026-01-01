import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, authCookieOptions } from '../auth.js';

const withEnv = (env, fn) => {
  const original = { ...process.env };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    process.env = original;
  }
};

test('signToken and verifyToken round-trip payload', () => {
  withEnv({ JWT_SECRET: 'test-secret' }, () => {
    const token = signToken({ userId: 'user-1' });
    const decoded = verifyToken(token);
    assert.equal(decoded.userId, 'user-1');
  });
});

test('authCookieOptions reflects production secure flag', () => {
  withEnv({ NODE_ENV: 'production' }, () => {
    const options = authCookieOptions();
    assert.equal(options.secure, true);
  });

  withEnv({ NODE_ENV: 'development' }, () => {
    const options = authCookieOptions();
    assert.equal(options.secure, false);
  });
});
