import test from 'node:test';
import assert from 'node:assert/strict';
import { getSecureCookieSetting } from '../auth.js';

const withEnv = (updates: Record<string, string>, fn: () => void) => {
  const previous = { ...process.env };
  Object.assign(process.env, updates);
  try {
    fn();
  } finally {
    process.env = previous;
  }
};

test('secure cookies enabled when all origins are https', () => {
  withEnv({ CLIENT_ORIGIN: 'https://example.com,https://chat.example.com' }, () => {
    assert.equal(getSecureCookieSetting(), true);
  });
});

test('secure cookies enabled in production even with http origin', () => {
  withEnv(
    { CLIENT_ORIGIN: 'https://example.com,http://localhost:8080', NODE_ENV: 'production' },
    () => {
      assert.equal(getSecureCookieSetting(), true);
    },
  );
});

test('secure cookies disabled when any origin is http in non-production', () => {
  withEnv(
    { CLIENT_ORIGIN: 'https://example.com,http://localhost:8080', NODE_ENV: 'development' },
    () => {
      assert.equal(getSecureCookieSetting(), false);
    },
  );
});

test('secure cookies follow NODE_ENV when origin is missing', () => {
  withEnv({ CLIENT_ORIGIN: '', NODE_ENV: 'production' }, () => {
    assert.equal(getSecureCookieSetting(), true);
  });
  withEnv({ CLIENT_ORIGIN: '', NODE_ENV: 'development' }, () => {
    assert.equal(getSecureCookieSetting(), false);
  });
});
