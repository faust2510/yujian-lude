import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const EMAIL = 'parallel-login@example.test';
const PASSWORD = 'CorrectPassw0rd!';

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

test('parallel failed logins atomically reach lockout without losing attempts', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `login_concurrency_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);

    const { pool } = await import('../db.js');
    const { hashPassword } = await import('../auth.js');
    const { LOGIN_LOCKOUT_THRESHOLD } = await import('../lib/auth-security.js');
    const { default: authRoutes, recordFailedLogin } = await import('./auth.routes.js');
    appPool = pool;

    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS citext;
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        email CITEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'free',
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        vip_until TIMESTAMPTZ,
        vip_pro_until TIMESTAMPTZ,
        is_banned BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        nickname TEXT
      );
      CREATE TABLE login_attempts (
        email CITEXT NOT NULL,
        ip INET NOT NULL,
        failed_count SMALLINT NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (email, ip)
      );
      CREATE TABLE sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ('11111111-1111-4111-8111-111111111111', $1, $2)`,
      [EMAIL, await hashPassword(PASSWORD)],
    );

    await Promise.all(Array.from({ length: 20 }, () => recordFailedLogin(EMAIL, '127.0.0.1')));
    const atomicAttempt = await pool.query(
      'SELECT failed_count, locked_until FROM login_attempts WHERE email = $1 AND ip = $2',
      [EMAIL, '127.0.0.1'],
    );
    assert.equal(atomicAttempt.rows[0].failed_count, 20);
    assert.ok(new Date(atomicAttempt.rows[0].locked_until) > new Date());
    await pool.query('DELETE FROM login_attempts');

    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use(authRoutes);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = await listen(app);
    const endpoint = `http://127.0.0.1:${server.address().port}/login`;

    const responses = await Promise.all(Array.from({ length: 20 }, () => fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'WrongPassw0rd!' }),
    })));
    assert.ok(responses.every((response) => response.status === 401 || response.status === 429));

    const attempt = await pool.query(
      'SELECT failed_count, locked_until FROM login_attempts WHERE email = $1',
      [EMAIL],
    );
    assert.ok(attempt.rows[0].failed_count >= LOGIN_LOCKOUT_THRESHOLD);
    assert.ok(attempt.rows[0].failed_count <= 20);
    assert.ok(new Date(attempt.rows[0].locked_until) > new Date());

    const correct = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    assert.equal(correct.status, 429);
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
