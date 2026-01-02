import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUsernameAvailability, saveEmojiRecent } from '../services/userService.js';
import { ServiceError } from '../utils/errors.js';

test('checkUsernameAvailability returns invalid for bad usernames', async () => {
  const result = await checkUsernameAvailability('user-1', '??');
  assert.equal(result.valid, false);
  assert.equal(result.available, false);
});

test('saveEmojiRecent rejects empty emoji', async () => {
  await assert.rejects(
    () => saveEmojiRecent('user-1', ''),
    (err) => err instanceof ServiceError && err.status === 400
  );
});
