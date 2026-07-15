import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'rewards.js'),
  'utf8',
);

test('exposure scoring ignores blank text and follows required profile fields', () => {
  assert.match(source, /NULLIF\(BTRIM\(p\.nickname\), ''\) IS NOT NULL/);
  assert.match(source, /NULLIF\(BTRIM\(p\.goal\), ''\) IS NOT NULL/);
  assert.match(source, /NULLIF\(BTRIM\(fp\.testimony\), ''\) IS NOT NULL/);
  assert.doesNotMatch(source, /fp\.coworker\s+IS NOT NULL/);
});

test('VIP rewards grant Basic only while paid Pro grants both total and Pro time', async () => {
  const { grantVipDays, grantVipTierDays } = await import('./rewards.js');
  assert.equal(typeof grantVipTierDays, 'function');
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/vip_pro_until/.test(sql)) {
        return { rows: [{ vip_until: 'total-until', vip_pro_until: 'pro-until' }] };
      }
      return { rows: [{ vip_until: 'basic-until' }] };
    },
  };

  assert.equal(await grantVipDays(db, 'user-1', 14), 'basic-until');
  assert.doesNotMatch(calls[0].sql, /vip_pro_until/);

  assert.equal(await grantVipTierDays(db, 'user-1', 'basic', 30), 'basic-until');
  assert.doesNotMatch(calls[1].sql, /vip_pro_until/);

  assert.equal(await grantVipTierDays(db, 'user-1', 'pro', 30), 'pro-until');
  assert.match(calls[2].sql, /vip_until/);
  assert.match(calls[2].sql, /vip_pro_until/);
});

test('bulk exposure recomputation reads committed transaction settings and updates every user', async () => {
  const { recomputeAllExposure } = await import('./rewards.js');
  assert.equal(typeof recomputeAllExposure, 'function');
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM app_settings/.test(sql)) {
        return { rows: [
          { key: 'exposure.base', value: { value: 120 } },
          { key: 'exposure.endorsement_bonus', value: { value: 60 } },
          { key: 'course.exposure_multiplier', value: { value: 1.5 } },
        ] };
      }
      return { rows: [] };
    },
  };

  await recomputeAllExposure(db);

  const write = calls.find(({ sql }) => /INSERT INTO exposure/.test(sql));
  assert.ok(write);
  assert.deepEqual(write.params, [120, 60, 1.5]);
  assert.match(write.sql, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(write.sql, /badge_awarded\s*=\s*TRUE/);
});
