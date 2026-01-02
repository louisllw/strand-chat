import test from 'node:test';
import assert from 'node:assert/strict';
import { getMessageDedup, setMessageDedup } from '../services/messageDedup.js';

const withFakeNow = async (value: number, fn: () => Promise<void>) => {
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
    await setMessageDedup('user-a', 'client-1', message);
    assert.deepEqual(await getMessageDedup('user-a', 'client-1'), message);
    assert.equal(await getMessageDedup('user-b', 'client-1'), null);
  });
});

test('message dedup expires after TTL', async () => {
  await withFakeNow(0, async () => {
    await setMessageDedup('user-a', 'client-2', { id: 'm2' });
    assert.ok(await getMessageDedup('user-a', 'client-2'));
  });

  await withFakeNow(60 * 1000 + 1, async () => {
    assert.equal(await getMessageDedup('user-a', 'client-2'), null);
  });
});
