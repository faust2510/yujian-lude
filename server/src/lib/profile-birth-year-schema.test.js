import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return readFileSync(path.join(serverRoot, relativePath), 'utf8');
}

function readOptional(relativePath) {
  const target = path.join(serverRoot, relativePath);
  return existsSync(target) ? readFileSync(target, 'utf8') : '';
}

const schema = read('db/schema.sql');
const migration = readOptional('db/migrations/0022_harden_profile_birth_year.sql');

test('fresh schema rejects non-adult profile birth years', () => {
  assert.match(
    schema,
    /CONSTRAINT\s+profiles_birth_year_adult_check\s+CHECK\s*\([^;]*birth_year[^;]*1940[^;]*CURRENT_DATE/is
  );
});

test('incremental migration cleans legacy years and adds the adult constraint', () => {
  assert.match(migration, /UPDATE\s+profiles[\s\S]*birth_year\s*=\s*NULL/i);
  assert.match(migration, /completion\s*=\s*LEAST\(completion,\s*88\)/i);
  assert.match(migration, /ADD\s+CONSTRAINT\s+profiles_birth_year_adult_check[\s\S]*1940[\s\S]*CURRENT_DATE/i);
});

function connectionUrlWithDatabase(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

test('PostgreSQL migration cleans invalid legacy years and enforces future writes', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `profile_birth_year_${process.pid}_${randomUUID().replace(/-/g, '')}`;
  const maintenanceUrl = connectionUrlWithDatabase(TEST_DATABASE_URL, 'postgres');
  const databaseUrl = connectionUrlWithDatabase(TEST_DATABASE_URL, databaseName);
  const adminPool = new Pool({ connectionString: maintenanceUrl });
  let databasePool;

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databasePool = new Pool({ connectionString: databaseUrl });
    await databasePool.query(schema);
    await databasePool.query('ALTER TABLE profiles DROP CONSTRAINT profiles_birth_year_adult_check');
    const userId = randomUUID();
    await databasePool.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test')`,
      [userId, `legacy-birth-year-${userId}@example.test`]
    );
    await databasePool.query(
      `INSERT INTO profiles (user_id, birth_year, privacy_ok, completion)
       VALUES ($1, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, TRUE, 100)`,
      [userId]
    );

    await databasePool.query(migration);
    const cleaned = await databasePool.query(
      'SELECT birth_year, completion FROM profiles WHERE user_id = $1',
      [userId]
    );
    assert.deepEqual(cleaned.rows[0], { birth_year: null, completion: 88 });

    await assert.rejects(
      databasePool.query(
        `UPDATE profiles
            SET birth_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
          WHERE user_id = $1`,
        [userId]
      ),
      (error) => error?.code === '23514'
    );
    await databasePool.query('UPDATE profiles SET birth_year = 1990 WHERE user_id = $1', [userId]);
  } finally {
    if (databasePool) await databasePool.end();
    await adminPool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await adminPool.end();
  }
});
