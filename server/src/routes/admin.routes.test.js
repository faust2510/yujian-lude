import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { pool } from '../db.js';
import adminRoutes from './admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.join(__dirname, 'admin.routes.js');
const source = readFileSync(routePath, 'utf8');
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestSettingUpdate({ actor, auditError = null }) {
  const calls = [];
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const run = async (sql, params = [], transaction = false) => {
    const compact = compactSql(sql);
    calls.push({ sql: compact, params, transaction });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compact)) return { rows: [] };
    if (/SELECT id, role, is_banned FROM users WHERE id = \$1 FOR UPDATE/i.test(compact)) {
      return { rows: [actor] };
    }
    if (/INSERT INTO admin_audit_logs/i.test(compact)) {
      if (auditError) throw auditError;
      return { rows: [] };
    }
    if (/INSERT INTO app_settings/i.test(compact)) return { rows: [] };
    throw new Error(`Unexpected SQL: ${compact}`);
  };
  pool.query = (sql, params) => run(sql, params, false);
  pool.connect = async () => ({
    query: (sql, params) => run(sql, params, true),
    release() {},
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: ADMIN_ID, role: 'admin', is_banned: false };
    next();
  });
  app.use(adminRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/settings/points.daily_checkin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: { amount: 10, pool: 'earned' } }),
    });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('admin settings reject fractional values used by INTEGER columns', async () => {
  const adminRoutes = await import('./admin.routes.js');
  assert.equal(typeof adminRoutes.getAdminIntegerSettingError, 'function');

  assert.equal(
    adminRoutes.getAdminIntegerSettingError('points.endorsement_done', { amount: 1.5, pool: 'earned', once: true }),
    'amount 必须是整数',
  );
  assert.equal(
    adminRoutes.getAdminIntegerSettingError('limits.daily_intents_free', { value: 1.5 }),
    'value 必须是整数',
  );
  assert.equal(
    adminRoutes.getAdminIntegerSettingError('redeem.vip_per_day', { points: 100, days: 1.5 }),
    'days 必须是整数',
  );
  assert.equal(
    adminRoutes.getAdminIntegerSettingError('course.exposure_multiplier', { value: 1.5 }),
    null,
  );
  assert.match(
    source,
    /const integerError = getAdminIntegerSettingError\([\s\S]*if \(integerError\) return res\.status\(400\)/,
  );
});

test('setting update rolls back its database write when audit insertion fails', async () => {
  const result = await requestSettingUpdate({
    actor: { id: ADMIN_ID, role: 'admin', is_banned: false },
    auditError: new Error('audit storage unavailable'),
  });

  assert.equal(result.status, 500);
  assert.equal(result.calls[0].sql, 'BEGIN');
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql, transaction }) => !transaction && /INSERT INTO app_settings/i.test(sql)), false);
  assert.equal(result.calls.some(({ sql, transaction }) => !transaction && /INSERT INTO admin_audit_logs/i.test(sql)), false);
});

test('setting update revalidates the actor inside its transaction before writing', async () => {
  const result = await requestSettingUpdate({
    actor: { id: ADMIN_ID, role: 'free', is_banned: false },
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls[0].sql, 'BEGIN');
  assert.match(result.calls[1].sql, /SELECT id, role, is_banned FROM users WHERE id = \$1 FOR UPDATE/i);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO app_settings|INSERT INTO admin_audit_logs/i.test(sql)), false);
});

test('setting update invalidates the shared cache only after its transaction commits', () => {
  const settingRoute = source.slice(
    source.indexOf("router.put('/settings/:key'"),
    source.indexOf('// ---- 用户管理'),
  );
  const transactionEnd = settingRoute.indexOf('await tx(');
  const invalidation = settingRoute.indexOf('invalidateSettings()');

  assert.match(source, /import \{[^}]*invalidateSettings[^}]*\} from '\.\.\/settings\.js'/s);
  assert.ok(transactionEnd >= 0);
  assert.ok(invalidation > settingRoute.indexOf('});', transactionEnd));
});

test('exposure setting updates serialize and recompute all existing users inside the transaction', () => {
  const settingRoute = source.slice(
    source.indexOf("router.put('/settings/:key'"),
    source.indexOf('// ---- 用户管理'),
  );

  assert.match(source, /import \{[^}]*recomputeAllExposure[^}]*\} from '\.\.\/lib\/rewards\.js'/s);
  assert.match(settingRoute, /EXPOSURE_SETTING_KEYS\.has\(req\.params\.key\)/);
  assert.match(settingRoute, /pg_advisory_xact_lock/);
  assert.match(settingRoute, /await recomputeAllExposure\(db\)/);
  assert.ok(settingRoute.indexOf('await setSetting') < settingRoute.indexOf('await recomputeAllExposure'));
  assert.ok(settingRoute.indexOf('await recomputeAllExposure') < settingRoute.indexOf('await writeAdminAudit'));
});

test('endorsement review locks and conditionally transitions one pending row', () => {
  const reviewRoute = source.slice(
    source.indexOf("router.post('/endorsements/:id/review'"),
    source.indexOf('// ---- 概览统计'),
  );

  assert.match(reviewRoute, /SELECT[\s\S]*state[\s\S]*FROM endorsements[\s\S]*FOR UPDATE/);
  assert.match(reviewRoute, /canReviewEndorsement\(en\.state, decision\)/);
  assert.match(reviewRoute, /routeError\(409,/);
  assert.match(reviewRoute, /WHERE id = \$1 AND state = 'pending'/);
  assert.doesNotMatch(reviewRoute, /const en = await one\(/);
});

test('verified endorsement awards points once and recomputes exposure in the transaction', () => {
  const reviewRoute = source.slice(
    source.indexOf("router.post('/endorsements/:id/review'"),
    source.indexOf('// ---- 概览统计'),
  );
  const awardCall = "await awardPoints(db, en.user_id, 'points.endorsement_done', { refId: req.params.id })";
  const exposureCall = 'await recomputeExposure(db, en.user_id)';

  assert.match(source, /import \{[^}]*awardPoints[^}]*recomputeExposure[^}]*\} from '\.\.\/lib\/rewards\.js'/);
  assert.ok(reviewRoute.includes(awardCall));
  assert.ok(reviewRoute.includes(exposureCall));
  assert.ok(reviewRoute.indexOf(awardCall) < reviewRoute.indexOf(exposureCall));
  assert.match(reviewRoute, /catch \(err\)[\s\S]*sendRouteError\(res, err\)/);
});
