import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'parallel-verification-token';

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

async function waitForBlockedVerificationStatements(client, count) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query(
      `SELECT count(*)::int AS count
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND (
            query LIKE '%UPDATE users SET email_verified%'
            OR query LIKE '%DELETE FROM email_tokens%'
          )
          AND wait_event_type = 'Lock'`,
    );
    if (result.rows[0].count >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const activity = await client.query(
    `SELECT state, wait_event_type, wait_event, left(query, 240) AS query
       FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      ORDER BY pid`,
  );
  assert.fail(`timed out waiting for ${count} blocked verification statements: ${JSON.stringify(activity.rows)}`);
}

test('a verification email token can be consumed by only one concurrent request', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `verify_token_concurrency_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let locker;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);

    const { pool } = await import('../db.js');
    const { default: authRoutes } = await import('./auth.routes.js');
    appPool = pool;

    await pool.query(`
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
      CREATE TABLE users (id UUID PRIMARY KEY, email_verified BOOLEAN NOT NULL DEFAULT FALSE);
      CREATE TABLE email_tokens (
        token TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE points_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        pool TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE points_balance (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        earned_total INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO users (id) VALUES ('${USER_ID}');
      INSERT INTO email_tokens (token, user_id, expires_at)
      VALUES ('${TOKEN}', '${USER_ID}', now() + interval '1 hour');
    `);

    const app = express();
    app.use(express.json());
    app.use(authRoutes);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = await listen(app);

    locker = new Client({ connectionString: process.env.DATABASE_URL });
    await locker.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [USER_ID]);

    const endpoint = `http://127.0.0.1:${server.address().port}/verify?token=${TOKEN}`;
    const requests = [fetch(endpoint), fetch(endpoint)];
    const earlyResponses = await Promise.race([
      Promise.all(requests).then(async (responses) => Promise.all(responses.map(async (response) => ({
        status: response.status,
        body: await response.text(),
      })))),
      new Promise((resolve) => setTimeout(() => resolve(null), 250)),
    ]);
    assert.equal(earlyResponses, null, `verification requests returned before the locked user update: ${JSON.stringify(earlyResponses)}`);
    await waitForBlockedVerificationStatements(locker, 2);
    await locker.query('COMMIT');

    const responses = await Promise.all(requests);
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 400]);
    const ledger = await pool.query(
      `SELECT count(*)::int AS count FROM points_ledger WHERE reason = 'points.email_verified'`,
    );
    assert.equal(ledger.rows[0].count, 1);
  } finally {
    if (locker) {
      await locker.query('ROLLBACK').catch(() => {});
      await locker.end();
    }
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
