import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOGIN_LOCKOUT_THRESHOLD,
  createPublicToken,
  hashToken,
  isLocked,
  normalizeEmailKey,
  nextFailedLoginState,
} from './auth-security.js';

test('normalizes email keys for login attempt tracking', () => {
  assert.equal(normalizeEmailKey('  USER@Example.COM '), 'user@example.com');
  assert.equal(normalizeEmailKey(undefined), '');
});

test('hashes reset tokens without keeping the public token value', () => {
  const token = createPublicToken();
  const hash = hashToken(token);

  assert.equal(token.length, 48);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(hashToken(token), hash);
});

test('calculates login lockout state after repeated failures', () => {
  const now = new Date('2026-06-30T00:00:00.000Z');
  let state = null;

  for (let i = 0; i < LOGIN_LOCKOUT_THRESHOLD; i += 1) {
    state = nextFailedLoginState(state, now);
  }

  assert.equal(state.failedCount, LOGIN_LOCKOUT_THRESHOLD);
  assert.ok(state.lockedUntil instanceof Date);
  assert.equal(isLocked(state, now), true);
  assert.equal(isLocked(state, new Date('2026-06-30T00:16:00.000Z')), false);
});

test('resets failed login count after the lockout window expires', () => {
  const next = nextFailedLoginState({
    failed_count: LOGIN_LOCKOUT_THRESHOLD,
    locked_until: new Date('2026-06-30T00:15:00.000Z'),
    last_failed_at: new Date('2026-06-30T00:00:00.000Z'),
  }, new Date('2026-06-30T00:16:00.000Z'));

  assert.equal(next.failedCount, 1);
  assert.equal(next.lockedUntil, null);
});
