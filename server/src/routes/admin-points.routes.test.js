import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_POINTS_MAX_ABS_AMOUNT,
  adjustAdminPoints,
  validateAdminPointsInput,
} from '../lib/admin-points.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(path.join(__dirname, 'admin.routes.js'), 'utf8');

const actorId = '11111111-1111-4111-8111-111111111111';
const targetUserId = '22222222-2222-4222-8222-222222222222';

function createDb({ actor = { id: actorId, role: 'admin', is_banned: false }, target = { id: targetUserId }, balance = 40 } = {}) {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id, role, is_banned FROM users/.test(sql)) return { rows: actor ? [actor] : [] };
      if (/SELECT id FROM users/.test(sql)) return { rows: target ? [target] : [] };
      if (/SELECT earned_total FROM points_balance/.test(sql)) return { rows: [{ earned_total: balance }] };
      if (/UPDATE points_balance/.test(sql)) return { rows: [{ earned_total: params[1] }] };
      return { rows: [] };
    },
  };
  return { db, calls };
}

test('manual points input requires a UUID, bounded non-zero integer, and reason', () => {
  assert.equal(validateAdminPointsInput({ targetUserId: 'nope', amount: 1, reason: '补发' }).ok, false);
  assert.equal(validateAdminPointsInput({ targetUserId, amount: '1', reason: '补发' }).ok, false);
  assert.equal(validateAdminPointsInput({ targetUserId, amount: 0, reason: '补发' }).ok, false);
  assert.equal(validateAdminPointsInput({ targetUserId, amount: ADMIN_POINTS_MAX_ABS_AMOUNT + 1, reason: '补发' }).ok, false);
  assert.equal(validateAdminPointsInput({ targetUserId, amount: 1, reason: '   ' }).ok, false);
  assert.deepEqual(
    validateAdminPointsInput({ targetUserId, amount: -25, reason: '  纠正重复奖励  ' }),
    { ok: true, value: { targetUserId, amount: -25, reason: '纠正重复奖励' } },
  );
});

test('credit uses an admin-only ledger reason and keeps the required explanation in audit detail', async () => {
  const { db, calls } = createDb();
  let transactionCalls = 0;
  const result = await adjustAdminPoints(async (callback) => {
    transactionCalls += 1;
    return callback(db);
  }, { actorId, targetUserId, amount: 15, reason: 'points.daily_checkin' });

  assert.equal(transactionCalls, 1);
  assert.deepEqual(result, { balance: 55 });
  assert.match(calls[0].sql, /SELECT id, role, is_banned FROM users[\s\S]*FOR UPDATE/);
  assert.match(calls[1].sql, /SELECT id FROM users[\s\S]*FOR UPDATE/);
  assert.ok(calls.some(({ sql }) => /SELECT earned_total FROM points_balance[\s\S]*FOR UPDATE/.test(sql)));
  const ledger = calls.find(({ sql }) => /INSERT INTO points_ledger/.test(sql));
  assert.match(ledger.sql, /'earned'/);
  assert.equal(ledger.params[1], 'credit');
  assert.equal(ledger.params[2], 15);
  assert.equal(ledger.params[3], 'points.admin_adjustment');
  const audit = calls.find(({ sql }) => /INSERT INTO admin_audit_logs/.test(sql));
  assert.equal(JSON.parse(audit.params[4]).reason, 'points.daily_checkin');
});

test('debit writes a positive debit amount and returns the remaining earned balance', async () => {
  const { db, calls } = createDb({ balance: 40 });
  const result = await adjustAdminPoints(async (callback) => callback(db), {
    actorId,
    targetUserId,
    amount: -25,
    reason: '撤销误发',
  });

  assert.deepEqual(result, { balance: 15 });
  const ledger = calls.find(({ sql }) => /INSERT INTO points_ledger/.test(sql));
  assert.equal(ledger.params[1], 'debit');
  assert.equal(ledger.params[2], 25);
  assert.ok(calls.some(({ sql, params }) => /UPDATE points_balance/.test(sql) && params[1] === 15));
});

test('debit cannot overdraw earned balance', async () => {
  const { db, calls } = createDb({ balance: 10 });
  await assert.rejects(
    adjustAdminPoints(async (callback) => callback(db), {
      actorId,
      targetUserId,
      amount: -11,
      reason: '撤销误发',
    }),
    (error) => error.status === 409 && /余额不足/.test(error.message),
  );
  assert.equal(calls.some(({ sql }) => /INSERT INTO points_ledger/.test(sql)), false);
});

test('transaction revalidates that the actor is still an active admin', async () => {
  const { db, calls } = createDb({ actor: { id: actorId, role: 'free', is_banned: false } });
  await assert.rejects(
    adjustAdminPoints(async (callback) => callback(db), {
      actorId,
      targetUserId,
      amount: 10,
      reason: '补发',
    }),
    (error) => error.status === 403 && /管理员状态已失效/.test(error.message),
  );
  assert.equal(calls.some(({ sql }) => /INSERT INTO points_ledger/.test(sql)), false);
});

test('admin route is protected and exposes balance plus the points adjustment endpoint', () => {
  assert.match(routeSource, /router\.use\(requireAuth, requireRole\('admin'\)\)/);
  assert.match(routeSource, /router\.post\('\/users\/:id\/points'/);
  assert.match(routeSource, /adjustAdminPoints\(tx,/);
  assert.match(routeSource, /COALESCE\(pb\.earned_total, 0\)::int AS earned_points/);
  assert.match(routeSource, /LEFT JOIN points_balance pb ON pb\.user_id = u\.id/);
});
