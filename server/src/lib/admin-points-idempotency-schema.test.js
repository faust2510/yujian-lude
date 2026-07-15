import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { adjustAdminPoints } from './admin-points.js';

const { Pool } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
const migrationPath = path.join(root, 'db/migrations/0028_admin_points_idempotency.sql');
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

test('admin point adjustment operation ids are globally unique in fresh and migrated schemas', () => {
  const pattern = /CREATE UNIQUE INDEX[^;]+ON points_ledger\s*\(reason, ref_id\)[^;]+reason = 'points\.admin_adjustment'[^;]+ref_id IS NOT NULL/is;
  assert.match(schema, pattern);
  assert.match(migration, pattern);
});

function connectionUrlWithDatabase(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

test('concurrent retries with one operation id create one ledger and one audit row', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `admin_points_${process.pid}_${randomUUID().replace(/-/g, '')}`;
  const maintenanceUrl = connectionUrlWithDatabase(TEST_DATABASE_URL, 'postgres');
  const databaseUrl = connectionUrlWithDatabase(TEST_DATABASE_URL, databaseName);
  const adminPool = new Pool({ connectionString: maintenanceUrl });
  let databasePool;

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databasePool = new Pool({ connectionString: databaseUrl });
    await databasePool.query(schema);

    const actorId = randomUUID();
    const targetUserId = randomUUID();
    const operationId = randomUUID();
    await databasePool.query(
      `INSERT INTO users (id, email, password_hash, role) VALUES
       ($1, $2, 'test', 'admin'), ($3, $4, 'test', 'free')`,
      [actorId, `admin-${actorId}@example.test`, targetUserId, `user-${targetUserId}@example.test`]
    );
    await databasePool.query(
      'INSERT INTO points_balance (user_id, earned_total) VALUES ($1, 10)',
      [targetUserId]
    );

    const runInTransaction = async (callback) => {
      const client = await databasePool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    const input = { actorId, targetUserId, operationId, amount: 5, reason: '并发补发' };
    const results = await Promise.all([
      adjustAdminPoints(runInTransaction, input),
      adjustAdminPoints(runInTransaction, input),
    ]);

    assert.deepEqual(results.map((result) => result.balance), [15, 15]);
    assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
    const ledger = await databasePool.query(
      "SELECT count(*)::int AS n FROM points_ledger WHERE reason = 'points.admin_adjustment' AND ref_id = $1",
      [operationId]
    );
    const audit = await databasePool.query(
      "SELECT count(*)::int AS n FROM admin_audit_logs WHERE action = 'points.adjust' AND target_id = $1",
      [targetUserId]
    );
    const balance = await databasePool.query('SELECT earned_total FROM points_balance WHERE user_id = $1', [targetUserId]);
    assert.equal(ledger.rows[0].n, 1);
    assert.equal(audit.rows[0].n, 1);
    assert.equal(balance.rows[0].earned_total, 15);
  } finally {
    if (databasePool) await databasePool.end();
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await adminPool.end();
  }
});
