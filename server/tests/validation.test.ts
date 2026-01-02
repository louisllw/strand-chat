import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, isValidUsername, allowedReactions } from '../utils/validation.js';

test('normalizeUsername trims, strips @, and lowercases', () => {
  assert.equal(normalizeUsername('  @Alice  '), 'alice');
  assert.equal(normalizeUsername('@@Mixed.Case'), 'mixed.case');
});

test('normalizeUsername handles non-strings safely', () => {
  assert.equal(normalizeUsername(null), '');
  assert.equal(normalizeUsername(123), '123');
});

test('isValidUsername enforces allowed pattern and length', () => {
  assert.equal(isValidUsername('abc'), true);
  assert.equal(isValidUsername('a'), false);
  assert.equal(isValidUsername('invalid name'), false);
  assert.equal(isValidUsername('ok_name.123'), true);
});

test('allowedReactions includes expected emoji', () => {
  assert.equal(allowedReactions.has('❤️'), true);
  assert.equal(allowedReactions.has('❌'), false);
});
