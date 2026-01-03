import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmojiRecents, upsertEmojiRecent } from '../models/emojiModel.js';
import { createUser, shouldRunIntegration } from './helpers/db.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('emojiModel stores and orders recents', { skip: !shouldRunIntegration }, async () => {
  const user = await createUser();

  await upsertEmojiRecent(user.id, '😀');
  await delay(10);
  await upsertEmojiRecent(user.id, '🔥');
  await delay(10);
  await upsertEmojiRecent(user.id, '😀');

  const recents = await getEmojiRecents(user.id, 5);
  assert.deepEqual(recents.slice(0, 2), ['😀', '🔥']);
});
