// app_settings 读写封装 + 内存缓存
// 所有价格/积分/兑换比例/额度都存在 app_settings 表，管理员可改，不硬编码。
import { query, one } from './db.js';

let cache = null;
let cacheAt = 0;
const TTL_MS = 30_000; // 30 秒缓存，改设置后会主动失效

// 锁定 plan v1 的兜底默认值（数据库缺失时使用）
const DEFAULTS = {
  'pricing.vip_basic': { price: 29, currency: 'CNY', period: 'month', name: '基础 VIP' },
  'pricing.vip_pro': { price: 59, currency: 'CNY', period: 'month', name: '进阶 VIP' },
  'points.daily_checkin': { amount: 10, pool: 'daily' },
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
    if (['amount', 'value', 'price', 'points', 'days', 'daily_cap'].includes(itemKey)) {
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

  return validateSettingObject(key, value, shape);
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
  const merged = { ...DEFAULTS };
  try {
    const { rows } = await query('SELECT key, value FROM app_settings');
    for (const r of rows) merged[r.key] = r.value;
  } catch (err) {
    console.warn('[settings] 读取 app_settings 失败，使用默认值：', err.message);
  }
  cache = merged;
  cacheAt = now;
  return merged;
}

export async function getSetting(key) {
  const s = await loadSettings();
  return s[key];
}

export async function setSetting(key, value, adminId) {
  await query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
    [key, settingStorageValue(value), adminId ?? null]
  );
  cache = null; // 失效缓存
}

export function invalidateSettings() {
  cache = null;
}
