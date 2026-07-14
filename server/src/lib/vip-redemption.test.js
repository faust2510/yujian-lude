import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateVipRedemptionCost,
  maxRedeemableVipDays,
} from './vip-redemption.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vipRoutesSource = readFileSync(path.join(srcRoot, 'routes', 'vip.routes.js'), 'utf8');
const pointsRoutesSource = readFileSync(path.join(srcRoot, 'routes', 'points.routes.js'), 'utf8');

test('calculates redemption cost from the configured points and day bundle', () => {
  assert.equal(calculateVipRedemptionCost(1, { points: 100, days: 1 }), 100);
  assert.equal(calculateVipRedemptionCost(3, { points: 150, days: 2 }), 225);
});

test('calculates the maximum whole days affordable from a balance', () => {
  assert.equal(maxRedeemableVipDays(200, { points: 150, days: 2 }), 2);
  assert.equal(maxRedeemableVipDays(149, { points: 150, days: 2 }), 1);
  assert.equal(maxRedeemableVipDays(0, { points: 100, days: 1 }), 0);
});

test('rejects invalid redemption settings and requested days', () => {
  assert.throws(() => calculateVipRedemptionCost(0, { points: 100, days: 1 }), /正整数/);
  assert.throws(() => calculateVipRedemptionCost(1, { points: 0, days: 1 }), /兑换配置/);
});

test('VIP and points APIs expose and use the configured redemption bundle', () => {
  assert.match(vipRoutesSource, /calculateVipRedemptionCost\(days, redemption\)/);
  assert.match(vipRoutesSource, /redemption:/);
  assert.match(pointsRoutesSource, /vipRedemption/);
  assert.match(pointsRoutesSource, /checkinAmount/);
});
