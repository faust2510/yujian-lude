import 'express-async-errors';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
const source = readFileSync(path.join(__dirname, 'match.routes.js'), 'utf8');
const schema = readFileSync(path.join(serverRoot, 'db/schema.sql'), 'utf8');
const seed = readFileSync(path.join(serverRoot, 'db/seed.sql'), 'utf8');
const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_IDS = Array.from({ length: 8 }, (_, index) =>
  `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`
);

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function close(server) {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('daily intent count is checked after a per-user transaction lock', () => {
  const transactionIndex = source.indexOf('await tx(async (db)');
  const userLockIndex = source.indexOf('pg_advisory_xact_lock(hashtext($1))');
  const quotaCountIndex = source.indexOf('intent_sent_at::date = CURRENT_DATE');

  assert.ok(transactionIndex >= 0);
  assert.ok(userLockIndex > transactionIndex);
  assert.ok(quotaCountIndex > userLockIndex);
});

test('parallel intents cannot exceed the free daily quota', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `match_intent_quota_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);

    const { pool } = await import('../db.js');
    const { default: matchRoutes } = await import('./match.routes.js');
    appPool = pool;
    await pool.query(schema);
    await pool.query(seed);
    await pool.query(
      `UPDATE app_settings
          SET value = CASE key
            WHEN 'match.require_verified_pastor' THEN 'false'::jsonb
            WHEN 'match.require_faith_test' THEN 'false'::jsonb
            WHEN 'match.require_light_course' THEN 'false'::jsonb
            WHEN 'limits.daily_intents_free' THEN '{"value":3}'::jsonb
            ELSE value
          END
        WHERE key IN (
          'match.require_verified_pastor',
          'match.require_faith_test',
          'match.require_light_course',
          'limits.daily_intents_free'
        )`
    );

    const ids = [VIEWER_ID, ...TARGET_IDS];
    for (const [index, id] of ids.entries()) {
      await pool.query(
        `INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, 'test')`,
        [id, `intent-user-${index}@example.test`]
      );
      await pool.query(
        `INSERT INTO profiles (user_id, nickname, birth_date, birth_year, privacy_ok, completion)
         VALUES ($1, $2, DATE '1990-01-01', 1990, TRUE, 100)`,
        [id, `用户${index}`]
      );
      await pool.query(
        `INSERT INTO faith_profiles
           (user_id, church_name, presbytery, region, denomination, baptism_date, faith_years, testimony)
         VALUES ($1, '测试教会', '测试区会', '上海', '长老会', DATE '2020-01-01', 5, '测试见证')`,
        [id]
      );
    }

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: VIEWER_ID, role: 'free', is_vip: false };
      next();
    });
    app.use(matchRoutes);
    app.use((error, _req, res, _next) => {
      res.status(error.status || 500).json({ error: error.message });
    });
    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const responses = await Promise.all(TARGET_IDS.map((targetId) =>
      fetch(`${baseUrl}/match/${targetId}/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: 'like' }),
      })
    ));

    assert.deepEqual(
      responses.map(({ status }) => status).sort((a, b) => a - b),
      [200, 200, 200, 429, 429, 429, 429, 429]
    );
    const persisted = await pool.query(
      `SELECT target_id FROM matches
        WHERE user_id = $1 AND status = 'intent_sent'`,
      [VIEWER_ID]
    );
    assert.equal(persisted.rowCount, 3);
  } finally {
    await close(server);
    if (appPool) await appPool.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName]
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
