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
const schema = readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8');
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

test('admin role change succeeds through HTTP, transaction, and audit log', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `admin_user_role_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);
    const { pool } = await import('../db.js');
    const { default: adminRoutes } = await import('./admin.routes.js');
    appPool = pool;
    await pool.query(schema);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role) VALUES
        ($1, 'role-admin@example.test', 'test', 'admin'),
        ($2, 'role-target@example.test', 'test', 'free')`,
      [ADMIN_ID, TARGET_ID],
    );

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: ADMIN_ID, role: 'admin', is_banned: false };
      next();
    });
    app.use('/admin', adminRoutes);
    app.use((error, _req, res, _next) => {
      res.status(error.status || 500).json({ error: error.message });
    });
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });

    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/admin/users/${TARGET_ID}/role`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'pastor' }),
      },
    );
    assert.equal(response.status, 200, await response.text());

    const target = await pool.query('SELECT role FROM users WHERE id = $1', [TARGET_ID]);
    assert.equal(target.rows[0].role, 'pastor');
    const audit = await pool.query(
      `SELECT actor_id, action, target_type, target_id, detail
         FROM admin_audit_logs
        WHERE action = 'user.role' AND target_id = $1`,
      [TARGET_ID],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].actor_id, ADMIN_ID);
    assert.equal(audit.rows[0].target_type, 'user');
    assert.deepEqual(audit.rows[0].detail, { role: 'pastor' });
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (appPool) await appPool.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
