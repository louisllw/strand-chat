import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, sanitizeProfileField } from '../utils/sanitize.js';

test('sanitizeText strips HTML tags', () => {
  assert.equal(sanitizeText('<b>hello</b>'), 'hello');
  assert.equal(sanitizeText('<div>hi <em>there</em></div>'), 'hi there');
});

test('sanitizeProfileField trims sanitized text', () => {
  assert.equal(sanitizeProfileField('  hello  '), 'hello');
});
