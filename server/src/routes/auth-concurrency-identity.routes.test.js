import 'express-async-errors';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = 'CorrectPassw0rd!';
const REGISTER_EMAIL = 'parallel-register@example.test';
const IDENTITY_EMAIL = 'identity@example.test';
const REGISTER_LOCK_KEY = 817_263_544;
const RESET_LOCK_KEY = 918_273_645;

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

async function waitForBlockedStatements(client, pattern, count = 1) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await client.query(
      `SELECT count(*)::int AS count
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND query LIKE $1
          AND wait_event_type = 'Lock'`,
      [pattern],
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
  assert.fail(`timed out waiting for blocked statements matching ${pattern}: ${JSON.stringify(activity.rows)}`);
}

async function json(response) {
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function assertNoSensitiveUserFields(user) {
  for (const field of ['password_hash', 'is_banned', 'token', 'token_hash']) {
    assert.equal(Object.hasOwn(user, field), false, `response leaked ${field}`);
  }
}

test('auth concurrency and identity responses use atomic PostgreSQL behavior', {
  skip: !TEST_DATABASE_URL,
  timeout: 60_000,
}, async (t) => {
  const databaseName = `auth_concurrency_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);
    process.env.NODE_ENV = 'test';
    process.env.EXPOSE_DEV_TOKENS = 'true';
    process.env.SMTP_HOST = '';
    process.env.SMTP_FROM = '';

    const { pool } = await import('../db.js');
    const { attachUser } = await import('../auth.js');
    const { default: authRoutes } = await import('./auth.routes.js');
    appPool = pool;

    const schema = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
    await pool.query(schema);

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(attachUser);
    app.use(authRoutes);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    await t.test('same-email concurrent registration returns one 201 and the rest 409', async () => {
      await pool.query(`
        CREATE FUNCTION hold_user_insert() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_advisory_lock(${REGISTER_LOCK_KEY});
          PERFORM pg_advisory_unlock(${REGISTER_LOCK_KEY});
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER hold_user_insert
          BEFORE INSERT ON users
          FOR EACH ROW EXECUTE FUNCTION hold_user_insert();
      `);

      const locker = new Client({ connectionString: process.env.DATABASE_URL });
      await locker.connect();
      try {
        await locker.query('SELECT pg_advisory_lock($1)', [REGISTER_LOCK_KEY]);

        const requests = Array.from({ length: 8 }, () => fetch(`${baseUrl}/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: REGISTER_EMAIL, password: PASSWORD, nickname: '并发昵称' }),
        }));

        await waitForBlockedStatements(locker, '%INSERT INTO users%');
        await new Promise((resolve) => setTimeout(resolve, 200));
        await locker.query('SELECT pg_advisory_unlock($1)', [REGISTER_LOCK_KEY]);
        const responses = await Promise.all(requests);
        const statuses = responses.map(({ status }) => status).sort((a, b) => a - b);
        assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409, 409, 409]);

        const users = await pool.query('SELECT count(*)::int AS count FROM users WHERE email = $1', [REGISTER_EMAIL]);
        assert.equal(users.rows[0].count, 1);
      } finally {
        await locker.query('SELECT pg_advisory_unlock($1)', [REGISTER_LOCK_KEY]).catch(() => {});
        await locker.end();
      }
    });

    await t.test('concurrent forgot-password requests create at most three recent tokens', async () => {
      await pool.query(`
        CREATE FUNCTION hold_password_reset_insert() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_advisory_lock(${RESET_LOCK_KEY});
          PERFORM pg_advisory_unlock(${RESET_LOCK_KEY});
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER hold_password_reset_insert
          BEFORE INSERT ON password_reset_tokens
          FOR EACH ROW EXECUTE FUNCTION hold_password_reset_insert();
      `);

      const locker = new Client({ connectionString: process.env.DATABASE_URL });
      await locker.connect();
      try {
        await locker.query('SELECT pg_advisory_lock($1)', [RESET_LOCK_KEY]);
        const requests = Array.from({ length: 8 }, () => fetch(`${baseUrl}/forgot-password`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: REGISTER_EMAIL }),
        }).then(json));

        await waitForBlockedStatements(locker, '%INSERT INTO password_reset_tokens%');
        await new Promise((resolve) => setTimeout(resolve, 200));
        await locker.query('SELECT pg_advisory_unlock($1)', [RESET_LOCK_KEY]);

        const responses = await Promise.all(requests);
        assert.ok(responses.every(({ status, body }) => status === 200 && body.ok === true));
        assert.equal(responses.filter(({ body }) => body.devToken).length, 3);

        const tokens = await pool.query(
          `SELECT count(*)::int AS count
             FROM password_reset_tokens
            WHERE used_at IS NULL AND created_at > now() - interval '15 minutes'`,
        );
        assert.equal(tokens.rows[0].count, 3);
      } finally {
        await locker.query('SELECT pg_advisory_unlock($1)', [RESET_LOCK_KEY]).catch(() => {});
        await locker.end();
      }
    });

    await t.test('register, login, and me return the stored nickname without sensitive fields', async () => {
      const nickname = '真实昵称';
      const registered = await json(await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: IDENTITY_EMAIL, password: PASSWORD, nickname }),
      }));
      assert.equal(registered.status, 201);
      assert.equal(registered.body.user.nickname, nickname);
      assertNoSensitiveUserFields(registered.body.user);

      const loggedIn = await json(await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: IDENTITY_EMAIL, password: PASSWORD }),
      }));
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.body.user.nickname, nickname);
      assertNoSensitiveUserFields(loggedIn.body.user);

      const cookie = loggedIn.headers.get('set-cookie')?.split(';', 1)[0];
      assert.ok(cookie);
      const me = await json(await fetch(`${baseUrl}/me`, { headers: { cookie } }));
      assert.equal(me.status, 200);
      assert.equal(me.body.user.nickname, nickname);
      assertNoSensitiveUserFields(me.body.user);
    });
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
