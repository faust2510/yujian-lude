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
    [key, value, adminId ?? null]
  );
  cache = null; // 失效缓存
}

export function invalidateSettings() {
  cache = null;
}
