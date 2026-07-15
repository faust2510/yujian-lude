import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';

const { Client } = pg;

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const RELATIONSHIP_ID = '33333333-3333-4333-8333-333333333333';
const COURSE_ID = '22222222-2222-2222-2222-222222222222';

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function maintenanceDatabaseUrl() {
  return databaseUrlFor('postgres');
}

async function waitForBlockedRelationshipStatements(client, count) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query(
      `SELECT count(*)::int AS count
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND query LIKE '%relationships%'
          AND wait_event_type = 'Lock'`,
    );
    if (result.rows[0].count === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const activity = await client.query(
    `SELECT state, wait_event_type, wait_event, left(query, 240) AS query
       FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      ORDER BY pid`,
  );
  assert.fail(`timed out waiting for ${count} blocked relationship statements: ${JSON.stringify(activity.rows)}`);
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

test('concurrent confirmation by both participants preserves both confirmations', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `relationship_concurrency_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: maintenanceDatabaseUrl() });
  let appPool;
  let locker;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);

    const { pool } = await import('../db.js');
    const { default: relationshipRoutes } = await import('./relationships.routes.js');
    appPool = pool;

    await pool.query(`
      CREATE TYPE relationship_state AS ENUM (
        'chatting', 'exam_required', 'relationship_requested', 'mutual_confirmed',
        'pastoral_review', 'confirmed', 'ended'
      );
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
      CREATE TABLE course_exam_attempts (
        user_id UUID NOT NULL,
        course_id UUID NOT NULL,
        passed BOOLEAN NOT NULL
      );
      CREATE TABLE relationships (
        id UUID PRIMARY KEY,
        user_a UUID NOT NULL,
        user_b UUID NOT NULL,
        state relationship_state NOT NULL DEFAULT 'chatting',
        confirmation_requested_by UUID,
        confirmation_requested_at TIMESTAMPTZ,
        user_a_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        user_b_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        user_a_confirmed_at TIMESTAMPTZ,
        user_b_confirmed_at TIMESTAMPTZ,
        user_a_exam_passed BOOLEAN NOT NULL DEFAULT FALSE,
        user_b_exam_passed BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);
    await pool.query(
      `INSERT INTO course_exam_attempts (user_id, course_id, passed)
       VALUES ($1, $3, TRUE), ($2, $3, TRUE)`,
      [USER_A, USER_B, COURSE_ID],
    );
    await pool.query(
      `INSERT INTO relationships (id, user_a, user_b) VALUES ($1, $2, $3)`,
      [RELATIONSHIP_ID, USER_A, USER_B],
    );

    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: req.get('x-user-id'), role: 'free' };
      next();
    });
    app.use(relationshipRoutes);
    server = await listen(app);

    locker = new Client({ connectionString: process.env.DATABASE_URL });
    await locker.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM relationships WHERE id = $1 FOR UPDATE', [RELATIONSHIP_ID]);

    const endpoint = `http://127.0.0.1:${server.address().port}/relationships/${RELATIONSHIP_ID}/request-confirmation`;
    const requests = [USER_A, USER_B].map((userId) => fetch(endpoint, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    }));

    const earlyResponses = await Promise.race([
      Promise.all(requests).then(async (responses) => Promise.all(responses.map(async (response) => ({
        status: response.status,
        body: await response.text(),
      })))),
      new Promise((resolve) => setTimeout(() => resolve(null), 150)),
    ]);
    assert.equal(earlyResponses, null, `confirmation requests failed before the locked update: ${JSON.stringify(earlyResponses)}`);

    await waitForBlockedRelationshipStatements(locker, 2);
    await locker.query('COMMIT');

    const responses = await Promise.all(requests);
    assert.deepEqual(responses.map(({ status }) => status), [200, 200]);

    const result = await pool.query('SELECT * FROM relationships WHERE id = $1', [RELATIONSHIP_ID]);
    const relationship = result.rows[0];
    assert.equal(relationship.user_a_confirmed, true);
    assert.equal(relationship.user_b_confirmed, true);
    assert.equal(relationship.state, 'mutual_confirmed');
    assert.ok(relationship.user_a_confirmed_at);
    assert.ok(relationship.user_b_confirmed_at);
  } finally {
    if (locker) {
      await locker.query('ROLLBACK').catch(() => {});
      await locker.end();
    }
    await close(server);
    if (appPool) await appPool.end();
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
