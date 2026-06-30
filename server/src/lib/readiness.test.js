import test from 'node:test';
import assert from 'node:assert/strict';

import { formatReadiness, publicErrorMessage } from './readiness.js';

test('formats readiness success when every check passes', () => {
  const out = formatReadiness([
    { name: 'database', ok: true },
    { name: 'static_app', ok: true },
  ]);

  assert.deepEqual(out, {
    ok: true,
    checks: [
      { name: 'database', ok: true },
      { name: 'static_app', ok: true },
    ],
  });
});

test('formats readiness failure without leaking secret-like values', () => {
  const out = formatReadiness([
    { name: 'database', ok: false, error: 'password=secret DATABASE_URL=postgres://user:pass@host/db failed' },
  ]);

  assert.equal(out.ok, false);
  assert.equal(out.checks[0].ok, false);
  assert.equal(out.checks[0].error, 'check failed');
});

test('public error messages keep safe short errors', () => {
  assert.equal(publicErrorMessage(new Error('relation "users" does not exist')), 'relation "users" does not exist');
  assert.equal(publicErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:5432')), 'connect ECONNREFUSED 127.0.0.1:5432');
});
