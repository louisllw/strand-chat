import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findUserByEmail,
  findUserById,
  findUserPublicById,
  findUserForAuth,
  getUsernameMeta,
  isEmailTaken,
  isUsernameTaken,
  findUserIdByNormalizedUsername,
  findUsersByNormalizedUsernames,
} from '../models/userModel.js';
import { createUser, shouldRunIntegration } from './helpers/db.js';

test('userModel supports lookups and availability checks', { skip: !shouldRunIntegration }, async () => {
  const user = await createUser();
  assert.ok(user?.id);

  const byEmail = await findUserByEmail(user.email);
  assert.equal(byEmail?.id, user.id);

  const byId = await findUserById(user.id);
  assert.equal(byId?.email, user.email);

  const publicById = await findUserPublicById(user.id);
  assert.equal(publicById?.username, user.username);

  const forAuth = await findUserForAuth(user.id);
  assert.equal(forAuth?.id, user.id);

  const meta = await getUsernameMeta(user.id);
  assert.equal(meta?.username, user.username);

  assert.equal(await isEmailTaken(user.email), true);
  assert.equal(await isUsernameTaken(user.username), true);

  const normalizedId = await findUserIdByNormalizedUsername(user.username);
  assert.equal(normalizedId, user.id);

  const usersByNormalized = await findUsersByNormalizedUsernames([user.username, 'missing']);
  assert.equal(usersByNormalized.some((row) => row.id === user.id), true);
});
