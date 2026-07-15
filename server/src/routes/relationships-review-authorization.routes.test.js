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
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = readFileSync(path.join(serverRoot, 'db/schema.sql'), 'utf8');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const REVIEWER_ID = '33333333-3333-4333-8333-333333333333';
const RELATIONSHIP_ID = '44444444-4444-4444-8444-444444444444';

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

test('pastoral approval rechecks reviewer authorization in the final update', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `relationship_review_auth_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;
  let originalPoolQuery;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);
    const { pool } = await import('../db.js');
    const { default: relationshipRoutes } = await import('./relationships.routes.js');
    appPool = pool;
    await pool.query(schema);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, email_verified)
       VALUES ($1, 'a@example.test', 'test', TRUE),
              ($2, 'b@example.test', 'test', TRUE),
              ($3, 'reviewer@example.test', 'test', TRUE)`,
      [USER_A, USER_B, REVIEWER_ID],
    );
    await pool.query(
      `INSERT INTO endorsements (user_id, endorser_user_id, kind, name, contact, state, verified_at)
       VALUES ($1, $2, 'referrer', '审核人', 'reviewer@example.test', 'verified', now())`,
      [USER_A, REVIEWER_ID],
    );
    await pool.query(
      `INSERT INTO relationships
         (id, user_a, user_b, state, user_a_confirmed, user_b_confirmed)
       VALUES ($1, $2, $3, 'mutual_confirmed', TRUE, TRUE)`,
      [RELATIONSHIP_ID, USER_A, USER_B],
    );

    originalPoolQuery = pool.query;
    let revoked = false;
    pool.query = async function interceptedQuery(sql, params) {
      if (!revoked && /WITH updated AS/i.test(sql)) {
        revoked = true;
        await originalPoolQuery.call(pool, 'UPDATE users SET is_banned = TRUE WHERE id = $1', [REVIEWER_ID]);
      }
      return originalPoolQuery.call(pool, sql, params);
    };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: REVIEWER_ID, role: 'free' };
      next();
    });
    app.use(relationshipRoutes);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = await listen(app);

    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/relationships/${RELATIONSHIP_ID}/pastor-approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ side: 'user_a' }),
      },
    );

    assert.equal(response.status, 409, await response.text());
    const relationship = await originalPoolQuery.call(
      pool,
      'SELECT pastor_a_approved FROM relationships WHERE id = $1',
      [RELATIONSHIP_ID],
    );
    assert.equal(relationship.rows[0].pastor_a_approved, false);
    const audit = await originalPoolQuery.call(pool, 'SELECT 1 FROM admin_audit_logs');
    assert.equal(audit.rowCount, 0);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (appPool && originalPoolQuery) appPool.query = originalPoolQuery;
    if (appPool) await appPool.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
