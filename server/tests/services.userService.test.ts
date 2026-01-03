import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUsernameAvailability, saveEmojiRecent, updateUserProfile } from '../services/userService.js';
import { ServiceError } from '../utils/errors.js';
import { createUser, shouldRunIntegration } from './helpers/db.js';

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

test('updateUserProfile updates fields', { skip: !shouldRunIntegration }, async () => {
  const user = await createUser();
  const updated = await updateUserProfile(user.id, { bio: 'Hello world', website: 'example.com' });
  assert.equal(updated?.bio, 'Hello world');
  assert.equal(updated?.website_url, 'example.com');
});

test('checkUsernameAvailability returns available for unused name', { skip: !shouldRunIntegration }, async () => {
  const user = await createUser();
  const result = await checkUsernameAvailability(user.id, `available_${Date.now()}`);
  assert.equal(result.valid, true);
  assert.equal(result.available, true);
});
