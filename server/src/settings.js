// app_settings 读写封装 + 内存缓存
// 所有价格/积分/兑换比例/额度都存在 app_settings 表，管理员可改，不硬编码。
import { query, one } from './db.js';

let cache = null;
let cacheAt = 0;
let cacheEpoch = 0;
const TTL_MS = 30_000; // 30 秒缓存，改设置后会主动失效

// 锁定 plan v1 的兜底默认值（数据库缺失时使用）
const DEFAULTS = {
  'pricing.vip_basic': {
    price: 29,
    currency: 'CNY',
    period: 'month',
    name: '基础 VIP',
    duration_days: 30,
    available: true,
    payment_instructions: '请联系平台运营获取收款方式，付款后填写流水尾号。',
  },
  'pricing.vip_pro': {
    price: 59,
    currency: 'CNY',
    period: 'month',
    name: '进阶 VIP',
    duration_days: 30,
    available: true,
    payment_instructions: '请联系平台运营获取收款方式，付款后填写流水尾号。',
  },
  'points.daily_checkin': { amount: 10, pool: 'earned' },
  'points.profile_complete': { amount: 50, pool: 'earned', once: true },
  'points.endorsement_done': { amount: 50, pool: 'earned', once: true },
  'points.email_verified': { amount: 20, pool: 'earned', once: true },
  'points.course_complete': { amount: 300, pool: 'earned' },
  'points.intent_sent': { amount: 10, pool: 'earned', daily_cap: 1 },
  'redeem.vip_per_day': { points: 100, days: 1 },
  'course.completion_vip_days': { days: 14 },
  'course.exposure_multiplier': { value: 2.0 },
  'exposure.base': { value: 100 },
  'exposure.endorsement_bonus': { value: 50 },
  'match.require_verified_pastor': true,
  'match.require_faith_test': true,
  'match.require_light_course': true,
  'match.light_course_id': '22222222-2222-2222-2222-222222222222',
  'limits.daily_intents_free': { value: 3 },
  'limits.daily_intents_vip': { value: 15 },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POOLS = new Set(['daily', 'earned']);

export function getDefaultSetting(key) {
  if (!Object.hasOwn(DEFAULTS, key)) return undefined;
  return JSON.parse(JSON.stringify(DEFAULTS[key]));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateSettingObject(key, value, shape) {
  if (!isPlainObject(value)) return { ok: false, error: '配置值类型不正确' };
  const allowedKeys = new Set(Object.keys(shape));
  for (const itemKey of Object.keys(value)) {
    if (!allowedKeys.has(itemKey)) return { ok: false, error: `不支持字段 ${itemKey}` };
  }
  for (const [itemKey, shapeValue] of Object.entries(shape)) {
    if (!(itemKey in value)) return { ok: false, error: `缺少字段 ${itemKey}` };
    const item = value[itemKey];
    if (itemKey === 'duration_days') {
      if (!Number.isInteger(item) || item < 1 || item > 365) {
        return { ok: false, error: 'duration_days 必须是 1 至 365 的整数' };
      }
    } else if (['amount', 'value', 'price', 'points', 'days', 'daily_cap'].includes(itemKey)) {
      if (!positiveNumber(item)) return { ok: false, error: `${itemKey} 必须是正数` };
    } else if (itemKey === 'pool') {
      if (!POOLS.has(item)) return { ok: false, error: 'pool 必须是 daily 或 earned' };
    } else if (typeof shapeValue === 'boolean') {
      if (typeof item !== 'boolean') return { ok: false, error: `${itemKey} 必须是布尔值` };
    } else if (typeof shapeValue === 'string') {
      if (typeof item !== 'string' || !item.trim()) return { ok: false, error: `${itemKey} 必须是非空字符串` };
    }
  }
  return { ok: true, value };
}

export function validateSettingUpdate(key, value) {
  if (!Object.hasOwn(DEFAULTS, key)) return { ok: false, error: '未知配置项' };
  const shape = DEFAULTS[key];

  if (typeof shape === 'boolean') {
    return typeof value === 'boolean'
      ? { ok: true, value }
      : { ok: false, error: '配置值类型不正确' };
  }

  if (typeof shape === 'string') {
    if (key === 'match.light_course_id') {
      return typeof value === 'string' && UUID_RE.test(value)
        ? { ok: true, value }
        : { ok: false, error: '课程 ID 必须是 UUID' };
    }
    return typeof value === 'string' && value.trim()
      ? { ok: true, value }
      : { ok: false, error: '配置值类型不正确' };
  }

  const result = validateSettingObject(key, value, shape);
  if (!result.ok) return result;
  if (key === 'pricing.vip_basic' || key === 'pricing.vip_pro') {
    const amountMinor = Math.round(result.value.price * 100);
    if (
      !Number.isSafeInteger(amountMinor)
      || amountMinor < 1
      || amountMinor > 2_147_483_647
      || Math.abs(result.value.price * 100 - amountMinor) > 1e-6
    ) {
      return { ok: false, error: 'price 必须是可精确换算为分的有效金额' };
    }
    if (!/^[A-Za-z]{3,12}$/.test(result.value.currency.trim())) {
      return { ok: false, error: 'currency 必须是 3 至 12 位英文字母' };
    }
  }
  if (key === 'points.daily_checkin' && result.value.pool !== 'earned') {
    return { ok: false, error: '每日签到积分必须进入 earned 累积池' };
  }
  return result;
}

export function settingStorageValue(value) {
  return JSON.stringify(value);
}

export function settingsToAdminRows(settings) {
  return Object.entries(settings)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function loadSettings(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < TTL_MS) return cache;
  const requestEpoch = cacheEpoch;
  const merged = { ...DEFAULTS };
  try {
    const { rows } = await query('SELECT key, value FROM app_settings');
    for (const r of rows) merged[r.key] = r.value;
  } catch (err) {
    console.warn('[settings] 读取 app_settings 失败，使用默认值：', err.message);
  }
  if (requestEpoch === cacheEpoch) {
    cache = merged;
    cacheAt = now;
  }
  return merged;
}

export async function getSetting(key) {
  const s = await loadSettings();
  return s[key];
}

export async function setSetting(key, value, adminId, db = query) {
  const usesSharedQuery = typeof db === 'function';
  const runQuery = usesSharedQuery ? db : db.query.bind(db);
  await runQuery(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
    [key, settingStorageValue(value), adminId ?? null]
  );
  if (usesSharedQuery) invalidateSettings();
}

export function invalidateSettings() {
  cache = null;
  cacheAt = 0;
  cacheEpoch += 1;
}
