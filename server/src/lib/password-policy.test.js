import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePassword } from './password-policy.js';

test('password policy enforces the bcrypt 72-byte limit using UTF-8 bytes', () => {
  assert.equal(validatePassword('Passw0rd!'), null);
  assert.equal(validatePassword('a'.repeat(72)), null);
  assert.match(validatePassword('a'.repeat(73)), /72 字节/);
  assert.equal(validatePassword('密'.repeat(24)), null);
  assert.match(validatePassword('密'.repeat(25)), /72 字节/);
});

test('password policy rejects non-strings and supports login without the creation minimum', () => {
  assert.match(validatePassword(12345678), /必须是字符串/);
  assert.match(validatePassword('short'), /至少 8 位/);
  assert.equal(validatePassword('short', { requireMinimum: false }), null);
});
