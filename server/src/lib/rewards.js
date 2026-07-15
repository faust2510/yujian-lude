// 奖励逻辑复用层：发积分、重算曝光、发 VIP 天数
// 所有数值从 app_settings 读，不硬编码。
import { getSetting } from '../settings.js';

// 发积分。client 为事务 client（可选），reason 用于幂等判断（once 类任务）。
// 返回 { awarded:bool, amount, pool }
export async function awardPoints(db, userId, settingKey, { refId = null, force = false } = {}) {
  const cfg = await getSetting(settingKey);
  if (!cfg || !cfg.amount) return { awarded: false, amount: 0, pool: null };
  const pool = cfg.pool || 'earned';

  // Serialize the same user's same reward reason inside the surrounding transaction.
  // The ledger's course-specific unique index remains the final database guard.
  await db.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [String(userId), settingKey]
  );

  // once 任务：同 reason 已发过就不再发
  if (cfg.once && !force) {
    const { rows } = await db.query(
      'SELECT 1 FROM points_ledger WHERE user_id=$1 AND reason=$2 LIMIT 1',
      [userId, settingKey]
    );
    if (rows.length) return { awarded: false, amount: 0, pool };
  }

  // daily_cap：当天该 reason 累计封顶
  if (cfg.daily_cap) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM points_ledger
        WHERE user_id=$1 AND reason=$2 AND created_at::date = now()::date`,
      [userId, settingKey]
    );
    if (rows[0].n >= cfg.daily_cap) return { awarded: false, amount: 0, pool };
  }

  const inserted = await db.query(
    `INSERT INTO points_ledger (user_id, pool, direction, amount, reason, ref_id)
     VALUES ($1, $2, 'credit', $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [userId, pool, cfg.amount, settingKey, refId]
  );
  if (!inserted.rows.length) return { awarded: false, amount: 0, pool };

  // earned 池写入余额缓存
  if (pool === 'earned') {
    await db.query(
      `INSERT INTO points_balance (user_id, earned_total) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET earned_total = points_balance.earned_total + $2`,
      [userId, cfg.amount]
    );
  }
  return { awarded: true, amount: cfg.amount, pool };
}

// 扣 earned 积分（兑换用），余额不足返回 false
// ⚠️ 必须在事务内调用（传入 tx 的 db client）——否则 FOR UPDATE 行锁失效，并发兑换会超扣。
export async function spendPoints(db, userId, amount, reason, refId = null) {
  const { rows } = await db.query(
    'SELECT earned_total FROM points_balance WHERE user_id=$1 FOR UPDATE',
    [userId]
  );
  const bal = rows[0]?.earned_total ?? 0;
  if (bal < amount) return false;
  await db.query(
    `INSERT INTO points_ledger (user_id, pool, direction, amount, reason, ref_id)
     VALUES ($1, 'earned', 'debit', $2, $3, $4)`,
    [userId, amount, reason, refId]
  );
  await db.query(
    'UPDATE points_balance SET earned_total = earned_total - $2 WHERE user_id=$1',
    [userId, amount]
  );
  return true;
}

// 重算曝光分：computed = (base + profile_score + endorsement_bonus) * course_multiplier
export async function recomputeExposure(db, userId) {
  const base = (await getSetting('exposure.base'))?.value ?? 100;
  const bonusPer = (await getSetting('exposure.endorsement_bonus'))?.value ?? 50;
  const courseMul = (await getSetting('course.exposure_multiplier'))?.value ?? 2.0;

  // 资料完整度得分（满分 50，每项非空 +5）
  const { rows: pr } = await db.query(
    `SELECT
      (CASE WHEN NULLIF(BTRIM(p.nickname), '') IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN NULLIF(BTRIM(p.city), '') IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN p.birth_date    IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN NULLIF(BTRIM(p.education), '') IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN NULLIF(BTRIM(p.goal), '') IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN NULLIF(BTRIM(fp.church_name), '') IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN NULLIF(BTRIM(fp.presbytery), '') IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN fp.baptism_date IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN fp.faith_years  IS NOT NULL THEN 5 ELSE 0 END +
       CASE WHEN NULLIF(BTRIM(fp.testimony), '') IS NOT NULL THEN 5 ELSE 0 END) AS profile_score
     FROM profiles p
     LEFT JOIN faith_profiles fp ON fp.user_id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );
  const profileScore = pr[0]?.profile_score ?? 0;

  // 牧者或引荐人任一 verified 背书均产生同等信任加成。
  const { rows: er } = await db.query(
    `SELECT COUNT(*)::int AS n FROM endorsements
      WHERE user_id=$1 AND kind IN ('pastor', 'referrer') AND state='verified'`,
    [userId]
  );
  const hasEndorsement = er[0].n > 0;
  const bonus = hasEndorsement ? bonusPer : 0;

  // 只有深度装备课发放徽章后，才进入曝光倍数；轻量入池课不等同于凯勒装备课。
  const { rows: cr } = await db.query(
    `SELECT COUNT(*)::int AS n FROM course_progress
      WHERE user_id=$1 AND state='completed' AND badge_awarded=TRUE`,
    [userId]
  );
  const mul = cr[0].n > 0 ? courseMul : 1.0;
  const computed = Math.round((base + profileScore + bonus) * mul);

  await db.query(
    `INSERT INTO exposure (user_id, base_score, endorsement_bonus, course_multiplier, computed_score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       base_score=$2, endorsement_bonus=$3, course_multiplier=$4, computed_score=$5`,
    [userId, base, bonus, mul, computed]
  );
  return computed;
}

export async function recomputeAllExposure(db) {
  const keys = ['exposure.base', 'exposure.endorsement_bonus', 'course.exposure_multiplier'];
  const settingRows = await db.query('SELECT key, value FROM app_settings WHERE key = ANY($1::text[])', [keys]);
  const settings = new Map(settingRows.rows.map((row) => [row.key, row.value]));
  const numberSetting = (key, fallback) => {
    const value = Number(settings.get(key)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  const base = numberSetting('exposure.base', 100);
  const bonusPer = numberSetting('exposure.endorsement_bonus', 50);
  const courseMul = numberSetting('course.exposure_multiplier', 2);

  await db.query(
    `WITH scores AS (
       SELECT u.id AS user_id,
              (CASE WHEN NULLIF(BTRIM(p.nickname), '') IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN NULLIF(BTRIM(p.city), '') IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN p.birth_date IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN NULLIF(BTRIM(p.education), '') IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN NULLIF(BTRIM(p.goal), '') IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN NULLIF(BTRIM(fp.church_name), '') IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN NULLIF(BTRIM(fp.presbytery), '') IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN fp.baptism_date IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN fp.faith_years IS NOT NULL THEN 5 ELSE 0 END +
               CASE WHEN NULLIF(BTRIM(fp.testimony), '') IS NOT NULL THEN 5 ELSE 0 END) AS profile_score,
              EXISTS(SELECT 1 FROM endorsements en
                       WHERE en.user_id = u.id AND en.kind IN ('pastor', 'referrer') AND en.state = 'verified') AS has_endorsement,
              EXISTS(SELECT 1 FROM course_progress cp
                       WHERE cp.user_id = u.id AND cp.state = 'completed' AND cp.badge_awarded = TRUE) AS has_badge
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN faith_profiles fp ON fp.user_id = u.id
     )
     INSERT INTO exposure (user_id, base_score, endorsement_bonus, course_multiplier, computed_score)
     SELECT user_id,
            $1,
            CASE WHEN has_endorsement THEN $2 ELSE 0 END,
            CASE WHEN has_badge THEN $3 ELSE 1 END,
            ROUND(($1 + profile_score + CASE WHEN has_endorsement THEN $2 ELSE 0 END) *
                  CASE WHEN has_badge THEN $3 ELSE 1 END)::int
       FROM scores
     ON CONFLICT (user_id) DO UPDATE SET
       base_score = EXCLUDED.base_score,
       endorsement_bonus = EXCLUDED.endorsement_bonus,
       course_multiplier = EXCLUDED.course_multiplier,
       computed_score = EXCLUDED.computed_score`,
    [base, bonusPer, courseMul]
  );
}

// 发 VIP 天数（在现有 vip_until 基础上叠加；已过期则从现在起算）
export async function grantVipDays(db, userId, days) {
  const { rows } = await db.query(
    `UPDATE users SET vip_until =
       GREATEST(COALESCE(vip_until, now()), now()) + ($2 || ' days')::interval,
       updated_at = now()
     WHERE id=$1
     RETURNING vip_until`,
    [userId, String(days)]
  );
  return rows[0]?.vip_until ?? null;
}

// 付费审批按套餐发放：Pro 同时延长总 VIP 期限与深筛期限。
export async function grantVipTierDays(db, userId, tier, days) {
  if (tier === 'basic') return grantVipDays(db, userId, days);
  if (tier !== 'pro') throw new Error('不支持的 VIP 套餐');

  const { rows } = await db.query(
    `UPDATE users SET
       vip_until = GREATEST(COALESCE(vip_until, now()), now()) + ($2 || ' days')::interval,
       vip_pro_until = GREATEST(COALESCE(vip_pro_until, now()), now()) + ($2 || ' days')::interval,
       updated_at = now()
     WHERE id=$1
     RETURNING vip_until, vip_pro_until`,
    [userId, String(days)]
  );
  return rows[0]?.vip_pro_until ?? null;
}
