import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readOptional = (relativePath) => {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
};

const schema = read('db/schema.sql');
const migration = readOptional('db/migrations/0027_enforce_faith_test_integrity.sql');

test('faith test scores are constrained to the twenty-question range', () => {
  assert.match(schema, /score\s+SMALLINT\s+NOT NULL\s+CONSTRAINT\s+faith_tests_score_range_check\s+CHECK\s*\(score BETWEEN 0 AND 20\)/i);
  assert.match(migration, /CHECK\s*\(score BETWEEN 0 AND 20\)/i);
});

test('faith test passed flag must agree with the fifteen-point pass threshold', () => {
  assert.match(schema, /passed\s+BOOLEAN\s+NOT NULL\s+CONSTRAINT\s+faith_tests_passed_score_check\s+CHECK\s*\(passed = \(score >= 15\)\)/i);
  assert.match(migration, /UPDATE faith_tests[\s\S]+SET passed = \(score >= 15\)/i);
  assert.match(migration, /CHECK\s*\(passed = \(score >= 15\)\)/i);
});

function connectionUrlWithDatabase(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

test('faith test integrity migration repairs legacy flags and enforces future writes', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `faith_integrity_${process.pid}_${randomUUID().replace(/-/g, '')}`;
  const maintenanceUrl = connectionUrlWithDatabase(TEST_DATABASE_URL, 'postgres');
  const databaseUrl = connectionUrlWithDatabase(TEST_DATABASE_URL, databaseName);
  const adminPool = new Pool({ connectionString: maintenanceUrl });
  let databasePool;

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databasePool = new Pool({ connectionString: databaseUrl });
    await databasePool.query(schema);
    await databasePool.query('ALTER TABLE faith_tests DROP CONSTRAINT IF EXISTS faith_tests_score_range_check');
    await databasePool.query('ALTER TABLE faith_tests DROP CONSTRAINT IF EXISTS faith_tests_passed_score_check');

    const userId = randomUUID();
    await databasePool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test')",
      [userId, `faith-integrity-${userId}@example.test`]
    );
    await databasePool.query(
      'INSERT INTO faith_tests (user_id, score, passed, attempt_no) VALUES ($1, 15, FALSE, 1)',
      [userId]
    );

    await databasePool.query(migration);
    const repaired = await databasePool.query(
      'SELECT score, passed FROM faith_tests WHERE user_id = $1',
      [userId]
    );
    assert.deepEqual(repaired.rows[0], { score: 15, passed: true });

    await assert.rejects(
      databasePool.query(
        'INSERT INTO faith_tests (user_id, score, passed, attempt_no) VALUES ($1, 21, TRUE, 2)',
        [userId]
      ),
      (error) => error?.code === '23514'
    );
    await assert.rejects(
      databasePool.query(
        'INSERT INTO faith_tests (user_id, score, passed, attempt_no) VALUES ($1, 15, FALSE, 2)',
        [userId]
      ),
      (error) => error?.code === '23514'
    );
  } finally {
    if (databasePool) await databasePool.end();
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await adminPool.end();
  }
});
