import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.join(__dirname, 'admin.routes.js');
const source = readFileSync(routePath, 'utf8');

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
