import test from 'node:test';
import assert from 'node:assert/strict';
import { getMessageDedup, setMessageDedup } from '../services/messageDedup.js';

const withFakeNow = async (value, fn) => {
  const original = Date.now;
  Date.now = () => value;
  try {
    await fn();
  } finally {
    Date.now = original;
  }
};

test('message dedup stores and retrieves per user/message id', async () => {
  await withFakeNow(0, async () => {
    const message = { id: 'm1' };
    setMessageDedup('user-a', 'client-1', message);
    assert.deepEqual(getMessageDedup('user-a', 'client-1'), message);
    assert.equal(getMessageDedup('user-b', 'client-1'), null);
  });
});

test('message dedup expires after TTL', async () => {
  await withFakeNow(0, async () => {
    setMessageDedup('user-a', 'client-2', { id: 'm2' });
    assert.ok(getMessageDedup('user-a', 'client-2'));
  });

  await withFakeNow(60 * 1000 + 1, async () => {
    assert.equal(getMessageDedup('user-a', 'client-2'), null);
  });
});
