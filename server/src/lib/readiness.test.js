import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

test('required-table readiness reports every missing runtime table', async () => {
  const readiness = await import('./readiness.js');
  assert.equal(typeof readiness.checkRequiredTables, 'function');
  const result = await readiness.checkRequiredTables(async (_sql, [tables]) => ({
    rows: tables.map((tableName) => ({
      table_name: tableName,
      exists: tableName !== 'faith_tests',
    })),
  }), ['users', 'sessions', 'faith_tests']);

  assert.equal(result.name, 'schema_tables');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /faith_tests/);
});

test('readiness and schema diagnosis share one required-table list', () => {
  const indexSource = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
  const diagnosisSource = readFileSync(fileURLToPath(new URL('../scripts/diagnose-schema.js', import.meta.url)), 'utf8');
  assert.match(indexSource, /REQUIRED_SCHEMA_TABLES/);
  assert.match(diagnosisSource, /REQUIRED_SCHEMA_TABLES/);
});

test('required schema tables cover AI consultation persistence', async () => {
  const { REQUIRED_SCHEMA_TABLES } = await import('./schema-requirements.js');
  assert.ok(REQUIRED_SCHEMA_TABLES.includes('ai_consultations'));
});

test('required schema tables cover account, points, exposure, and profile-view persistence', async () => {
  const { REQUIRED_SCHEMA_TABLES } = await import('./schema-requirements.js');
  for (const tableName of ['email_tokens', 'points_balance', 'points_ledger', 'exposure', 'profile_views']) {
    assert.ok(REQUIRED_SCHEMA_TABLES.includes(tableName), `missing ${tableName}`);
  }
});
