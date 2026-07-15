import test from 'node:test';
import assert from 'node:assert/strict';

import { pool } from './db.js';
import {
  getDefaultSetting,
  invalidateSettings,
  loadSettings,
  setSetting,
  settingStorageValue,
  settingsToAdminRows,
  validateSettingUpdate,
} from './settings.js';

test('rejects unknown setting keys', () => {
  assert.deepEqual(validateSettingUpdate('unknown.setting', true), {
    ok: false,
    error: '未知配置项',
  });
});

test('validates boolean settings by type', () => {
  assert.deepEqual(validateSettingUpdate('match.require_faith_test', true), {
    ok: true,
    value: true,
  });
  assert.deepEqual(validateSettingUpdate('match.require_faith_test', 'true'), {
    ok: false,
    error: '配置值类型不正确',
  });
});

test('validates numeric object settings', () => {
  assert.deepEqual(validateSettingUpdate('points.daily_checkin', { amount: 12, pool: 'earned' }), {
    ok: true,
    value: { amount: 12, pool: 'earned' },
  });
  assert.deepEqual(validateSettingUpdate('points.daily_checkin', { amount: 12, pool: 'daily' }), {
    ok: false,
    error: '每日签到积分必须进入 earned 累积池',
  });
  assert.deepEqual(validateSettingUpdate('points.daily_checkin', { amount: -1, pool: 'daily' }), {
    ok: false,
    error: 'amount 必须是正数',
  });
  assert.deepEqual(validateSettingUpdate('limits.daily_intents_free', { value: Number.NaN }), {
    ok: false,
    error: 'value 必须是正数',
  });
  assert.deepEqual(validateSettingUpdate('redeem.vip_per_day', { points: 0, days: 1 }), {
    ok: false,
    error: 'points 必须是正数',
  });
  assert.deepEqual(validateSettingUpdate('pricing.vip_basic', {
    price: 29,
    currency: 'CNY',
    period: 'month',
    name: '基础 VIP',
    duration_days: 30,
    available: true,
    payment_instructions: '联系运营获取收款方式',
  }).ok, true);
  assert.equal(validateSettingUpdate('pricing.vip_basic', {
    price: 29,
    currency: 'CNY',
    period: 'month',
    name: '基础 VIP',
    duration_days: 30,
    available: 'yes',
    payment_instructions: '联系运营获取收款方式',
  }).ok, false);
  assert.deepEqual(validateSettingUpdate('pricing.vip_basic', {
    price: 29,
    currency: 'CNY',
    period: 'month',
    name: '基础 VIP',
    duration_days: 366,
    available: true,
    payment_instructions: '联系运营获取收款方式',
  }), {
    ok: false,
    error: 'duration_days 必须是 1 至 365 的整数',
  });
  assert.deepEqual(validateSettingUpdate('pricing.vip_basic', {
    price: 0.001,
    currency: 'CNY',
    period: 'month',
    name: '基础 VIP',
    duration_days: 30,
    available: true,
    payment_instructions: '联系运营获取收款方式',
  }), {
    ok: false,
    error: 'price 必须是可精确换算为分的有效金额',
  });
  assert.deepEqual(validateSettingUpdate('pricing.vip_basic', {
    price: 29,
    currency: 'C',
    period: 'month',
    name: '基础 VIP',
    duration_days: 30,
    available: true,
    payment_instructions: '联系运营获取收款方式',
  }), {
    ok: false,
    error: 'currency 必须是 3 至 12 位英文字母',
  });
});

test('validates match light course id as uuid string', () => {
  assert.deepEqual(validateSettingUpdate('match.light_course_id', '22222222-2222-2222-2222-222222222222'), {
    ok: true,
    value: '22222222-2222-2222-2222-222222222222',
  });
  assert.deepEqual(validateSettingUpdate('match.light_course_id', 'not-a-uuid'), {
    ok: false,
    error: '课程 ID 必须是 UUID',
  });
});

test('serializes setting values before writing to jsonb', () => {
  assert.equal(settingStorageValue('22222222-2222-2222-2222-222222222222'), '"22222222-2222-2222-2222-222222222222"');
  assert.equal(settingStorageValue(true), 'true');
  assert.equal(settingStorageValue({ amount: 12, pool: 'earned' }), '{"amount":12,"pool":"earned"}');
});

test('converts settings map to admin rows', () => {
  assert.deepEqual(settingsToAdminRows({
    'match.require_faith_test': true,
    'points.daily_checkin': { amount: 10, pool: 'earned' },
  }), [
    { key: 'match.require_faith_test', value: true },
    { key: 'points.daily_checkin', value: { amount: 10, pool: 'earned' } },
  ]);
});

test('daily check-in points are cumulative by default', () => {
  assert.deepEqual(getDefaultSetting('points.daily_checkin'), {
    amount: 10,
    pool: 'earned',
  });
});

test('default VIP pricing launches Basic and Pro as configurable plans', () => {
  assert.deepEqual(getDefaultSetting('pricing.vip_basic'), {
    price: 29,
    currency: 'CNY',
    period: 'month',
    name: '基础 VIP',
    duration_days: 30,
    available: true,
    payment_instructions: '请联系平台运营获取收款方式，付款后填写流水尾号。',
  });
  assert.equal(getDefaultSetting('pricing.vip_pro').price, 59);
  assert.equal(getDefaultSetting('pricing.vip_pro').available, true);
});

test('transactional setting writes defer cache invalidation until the caller commits', async () => {
  const originalQuery = pool.query;
  let databaseReads = 0;
  pool.query = async () => {
    databaseReads += 1;
    return { rows: [{ key: 'points.daily_checkin', value: { amount: 10, pool: 'earned' } }] };
  };
  invalidateSettings();

  try {
    await loadSettings(true);
    databaseReads = 0;
    await setSetting(
      'points.daily_checkin',
      { amount: 12, pool: 'earned' },
      '11111111-1111-4111-8111-111111111111',
      { query: async () => ({ rows: [] }) },
    );

    const duringTransaction = await loadSettings();
    assert.equal(databaseReads, 0);
    assert.deepEqual(duringTransaction['points.daily_checkin'], { amount: 10, pool: 'earned' });
  } finally {
    pool.query = originalQuery;
    invalidateSettings();
  }
});

test('a database read started before invalidation cannot repopulate the cache afterward', async () => {
  const originalQuery = pool.query;
  let releaseStaleRead;
  let databaseReads = 0;
  pool.query = async () => {
    databaseReads += 1;
    if (databaseReads === 1) {
      return new Promise((resolve) => { releaseStaleRead = resolve; });
    }
    return { rows: [{ key: 'points.daily_checkin', value: { amount: 12, pool: 'earned' } }] };
  };
  invalidateSettings();

  try {
    const staleLoad = loadSettings(true);
    await new Promise((resolve) => setImmediate(resolve));
    invalidateSettings();
    releaseStaleRead({ rows: [{ key: 'points.daily_checkin', value: { amount: 10, pool: 'earned' } }] });
    await staleLoad;

    const current = await loadSettings();
    assert.equal(databaseReads, 2);
    assert.deepEqual(current['points.daily_checkin'], { amount: 12, pool: 'earned' });
  } finally {
    pool.query = originalQuery;
    invalidateSettings();
  }
});
