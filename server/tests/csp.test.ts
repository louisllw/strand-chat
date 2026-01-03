import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCspDirectives } from '../utils/csp.js';

test('CSP disables unsafe-inline in production', () => {
  const directives = buildCspDirectives(true);
  assert.equal(directives.scriptSrc.includes("'unsafe-inline'"), false);
  assert.equal(directives.styleSrc.includes("'unsafe-inline'"), false);
});

test('CSP allows unsafe-inline outside production', () => {
  const directives = buildCspDirectives(false);
  assert.equal(directives.scriptSrc.includes("'unsafe-inline'"), true);
  assert.equal(directives.styleSrc.includes("'unsafe-inline'"), true);
});
