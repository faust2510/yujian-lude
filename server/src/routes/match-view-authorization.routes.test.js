import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const VISIBLE_ID = '22222222-2222-4222-8222-222222222222';
const BANNED_ID = '33333333-3333-4333-8333-333333333333';
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444';
const MISSING_ID = '55555555-5555-4555-8555-555555555555';
const OUTSIDER_ID = '66666666-6666-4666-8666-666666666666';

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

test('profile views are recorded only for an existing visible match candidate', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `match_view_auth_${process.pid}_${Date.now()}`;
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

    await pool.query(`
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        is_banned BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        completion SMALLINT NOT NULL,
        privacy_ok BOOLEAN NOT NULL,
        birth_year INTEGER
      );
      CREATE TABLE faith_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        church_name TEXT,
        presbytery TEXT,
        baptism_date DATE,
        faith_years SMALLINT,
        testimony TEXT
      );
      CREATE TABLE faith_tests (user_id UUID NOT NULL, passed BOOLEAN NOT NULL);
      CREATE TABLE endorsements (user_id UUID NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE profile_views (
        viewer_id UUID NOT NULL REFERENCES users(id),
        viewed_id UUID NOT NULL REFERENCES users(id),
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE relationships (
        user_a UUID NOT NULL REFERENCES users(id),
        user_b UUID NOT NULL REFERENCES users(id),
        state TEXT NOT NULL
      );
    `);
    await pool.query(`
      INSERT INTO app_settings (key, value) VALUES
        ('match.require_verified_pastor', 'false'),
        ('match.require_faith_test', 'false'),
        ('match.require_light_course', 'false');
      INSERT INTO users (id, is_banned) VALUES
        ('${VIEWER_ID}', FALSE),
        ('${VISIBLE_ID}', FALSE),
        ('${BANNED_ID}', TRUE),
        ('${HIDDEN_ID}', FALSE),
        ('${OUTSIDER_ID}', FALSE);
      INSERT INTO profiles (user_id, completion, privacy_ok, birth_year) VALUES
        ('${VIEWER_ID}', 100, TRUE, 1990),
        ('${VISIBLE_ID}', 100, TRUE, 1990),
        ('${BANNED_ID}', 100, TRUE, 1990),
        ('${HIDDEN_ID}', 40, FALSE, 1990),
        ('${OUTSIDER_ID}', 40, FALSE, 1990);
      INSERT INTO faith_profiles (user_id, church_name, presbytery, baptism_date, faith_years, testimony)
      SELECT id, '测试教会', '测试区会', DATE '2020-01-01', 5, '测试见证'
        FROM users;
    `);

    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: req.get('x-user-id') || VIEWER_ID, role: 'free', is_vip: false };
      next();
    });
    app.use(matchRoutes);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const view = (targetId, userId = VIEWER_ID) => fetch(`${baseUrl}/match/${targetId}/view`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    });
    const rejected = await Promise.all([MISSING_ID, BANNED_ID, HIDDEN_ID].map((targetId) => view(targetId)));
    const rejectedResults = await Promise.all(rejected.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    assert.deepEqual(rejectedResults.map(({ status }) => status), [404, 404, 404], JSON.stringify(rejectedResults));

    const unqualifiedViewer = await view(VISIBLE_ID, OUTSIDER_ID);
    assert.equal(unqualifiedViewer.status, 403);

    const accepted = await view(VISIBLE_ID);
    assert.equal(accepted.status, 200);

    const rows = await pool.query('SELECT viewer_id, viewed_id FROM profile_views');
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].viewer_id, VIEWER_ID);
    assert.equal(rows.rows[0].viewed_id, VISIBLE_ID);

    await pool.query('DELETE FROM profile_views');
    await pool.query(
      `INSERT INTO relationships (user_a, user_b, state) VALUES ($1, $2, 'chatting')`,
      [VIEWER_ID, VISIBLE_ID],
    );
    const relatedCandidate = await view(VISIBLE_ID);
    assert.equal(relatedCandidate.status, 404);
    const afterRelationship = await pool.query('SELECT 1 FROM profile_views');
    assert.equal(afterRelationship.rowCount, 0);
  } finally {
    await close(server);
    if (appPool) await appPool.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
