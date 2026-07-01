import test from 'node:test';
import assert from 'node:assert/strict';

import { getDefaultSetting, settingStorageValue, settingsToAdminRows, validateSettingUpdate } from './settings.js';

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
