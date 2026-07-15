import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = readFileSync(path.join(serverRoot, 'db/schema.sql'), 'utf8');
const migration = readFileSync(
  path.join(serverRoot, 'db/migrations/0024_enforce_single_active_relationship_per_user.sql'),
  'utf8',
);
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

test('migration blocks relationship writes before checking historical conflicts', () => {
  const lock = migration.indexOf('LOCK TABLE relationships IN SHARE ROW EXCLUSIVE MODE');
  const conflictScan = migration.indexOf('IF EXISTS');
  const trigger = migration.indexOf('CREATE TRIGGER trg_relationships_one_active_user');

  assert.ok(lock >= 0);
  assert.ok(lock < conflictScan);
  assert.ok(conflictScan < trigger);
});

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

test('concurrent A-B and A-C initiation persists at most one active relationship for A', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `relationship_active_user_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  const first = new Client({ connectionString: databaseUrlFor(databaseName) });
  const second = new Client({ connectionString: databaseUrlFor(databaseName) });

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    await first.connect();
    await second.connect();
    await first.query(schema);
    await first.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, 'a@example.test', 'test'),
              ($2, 'b@example.test', 'test'),
              ($3, 'c@example.test', 'test')`,
      [USER_A, USER_B, USER_C],
    );

    const outcomes = await Promise.allSettled([
      first.query('INSERT INTO relationships (user_a, user_b) VALUES ($1, $2)', [USER_A, USER_B]),
      second.query('INSERT INTO relationships (user_a, user_b) VALUES ($1, $2)', [USER_A, USER_C]),
    ]);

    assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejected = outcomes.find(({ status }) => status === 'rejected');
    assert.equal(rejected?.reason?.code, '23505');
    const active = await first.query(
      `SELECT count(*)::int AS count FROM relationships
        WHERE state <> 'ended' AND (user_a = $1 OR user_b = $1)`,
      [USER_A],
    );
    assert.equal(active.rows[0].count, 1);
  } finally {
    await first.end().catch(() => {});
    await second.end().catch(() => {});
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
