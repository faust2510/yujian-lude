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
const schema = readFileSync(path.join(serverRoot, 'db/schema.sql'), 'utf8');
const seed = readFileSync(path.join(serverRoot, 'db/seed.sql'), 'utf8');
const ADMIN_A = '11111111-1111-4111-8111-111111111111';
const ADMIN_B = '22222222-2222-4222-8222-222222222222';
const REVOKED_ADMIN = '33333333-3333-4333-8333-333333333333';
const MEMBER = '44444444-4444-4444-8444-444444444444';

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

test('endorsement review is non-self, actor-safe, atomic, and idempotent', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async (t) => {
  const databaseName = `admin_endorsement_${process.pid}_${Date.now()}`;
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
    await pool.query(seed);

    const users = [
      [ADMIN_A, 'review-admin-a@example.test', 'admin', false],
      [ADMIN_B, 'review-admin-b@example.test', 'admin', false],
      [REVOKED_ADMIN, 'review-revoked@example.test', 'free', false],
      [MEMBER, 'review-member@example.test', 'free', false],
    ];
    for (const [id, email, role, banned] of users) {
      await pool.query(
        `INSERT INTO users (id, email, password_hash, role, is_banned)
         VALUES ($1, $2, 'test', $3::user_role, $4)`,
        [id, email, role, banned]
      );
      await pool.query(
        `INSERT INTO profiles (user_id, nickname, birth_year, privacy_ok, completion)
         VALUES ($1, $2, 1990, TRUE, 100)`,
        [id, email]
      );
      await pool.query('INSERT INTO points_balance (user_id, earned_total) VALUES ($1, 0)', [id]);
    }

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: req.get('x-admin-id') || ADMIN_A,
        role: 'admin',
        is_banned: false,
      };
      next();
    });
    app.use('/admin', adminRoutes);
    app.use((error, _req, res, _next) => {
      res.status(error.status || 500).json({ error: error.message });
    });
    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const review = (id, actorId = ADMIN_A) => fetch(`${baseUrl}/admin/endorsements/${id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-id': actorId },
      body: JSON.stringify({ decision: 'verified' }),
    });
    const createEndorsement = async (userId) => {
      const result = await pool.query(
        `INSERT INTO endorsements (user_id, kind, name, contact)
         VALUES ($1, 'referrer', '测试引荐人', 'referrer@example.test')
         RETURNING id`,
        [userId]
      );
      return result.rows[0].id;
    };

    await t.test('rejects malformed identifiers before PostgreSQL casts them', async () => {
      const response = await review('not-a-uuid');
      assert.equal(response.status, 400);
    });

    await t.test('rejects stale sessions whose admin was revoked in the database', async () => {
      const id = await createEndorsement(MEMBER);
      const response = await review(id, REVOKED_ADMIN);
      assert.equal(response.status, 403);
      const row = await pool.query('SELECT state FROM endorsements WHERE id = $1', [id]);
      assert.equal(row.rows[0].state, 'pending');
    });

    await t.test('rejects reviewing an endorsement owned by the admin actor', async () => {
      const id = await createEndorsement(ADMIN_A);
      const response = await review(id, ADMIN_A);
      assert.equal(response.status, 403);
      const row = await pool.query('SELECT state FROM endorsements WHERE id = $1', [id]);
      assert.equal(row.rows[0].state, 'pending');
    });

    await t.test('two concurrent reviews produce one award, exposure update, and audit', async () => {
      const id = await createEndorsement(MEMBER);
      const responses = await Promise.all([review(id, ADMIN_A), review(id, ADMIN_B)]);
      assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);

      const endorsement = await pool.query(
        'SELECT state, verified_by FROM endorsements WHERE id = $1',
        [id]
      );
      assert.equal(endorsement.rows[0].state, 'verified');
      assert.ok([ADMIN_A, ADMIN_B].includes(endorsement.rows[0].verified_by));

      const ledger = await pool.query(
        `SELECT amount FROM points_ledger
          WHERE user_id = $1 AND reason = 'points.endorsement_done'`,
        [MEMBER]
      );
      assert.equal(ledger.rowCount, 1);
      assert.equal(ledger.rows[0].amount, 50);
      const balance = await pool.query('SELECT earned_total FROM points_balance WHERE user_id = $1', [MEMBER]);
      assert.equal(balance.rows[0].earned_total, 50);
      const exposure = await pool.query('SELECT endorsement_bonus FROM exposure WHERE user_id = $1', [MEMBER]);
      assert.equal(exposure.rows[0].endorsement_bonus, 50);
      const audit = await pool.query(
        `SELECT 1 FROM admin_audit_logs
          WHERE action = 'endorsement.review' AND target_id = $1`,
        [id]
      );
      assert.equal(audit.rowCount, 1);
    });
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
