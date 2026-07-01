// 签到 + 积分 路由
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints } from '../lib/rewards.js';
import { getSetting } from '../settings.js';

const router = Router();

async function getPointsSummary(db, userId) {
  const { rows } = await db.query(
    `SELECT
        COALESCE(pb.earned_total, 0)::int AS earned,
        COALESCE(SUM(
          CASE
            WHEN pl.direction = 'credit' THEN pl.amount
            WHEN pl.direction = 'debit' THEN -pl.amount
            ELSE 0
          END
        ), 0)::int AS daily,
        (u.last_checkin_on = CURRENT_DATE) AS checked_in_today
       FROM users u
       LEFT JOIN points_balance pb ON pb.user_id = u.id
      LEFT JOIN points_ledger pl
         ON pl.user_id = u.id
        AND pl.reason = 'points.daily_checkin'
        AND pl.created_at::date = CURRENT_DATE
      WHERE u.id = $1
      GROUP BY u.id, pb.earned_total, u.last_checkin_on`,
    [userId]
  );
  const row = rows[0];
  return {
    earned: row?.earned ?? 0,
    daily: row?.daily ?? 0,
    checkedInToday: !!row?.checked_in_today,
  };
}

// 当前积分余额 + 今日是否已签到
router.get('/me/points', requireAuth, async (req, res) => {
  res.json(await getPointsSummary({ query }, req.user.id));
});

// 积分流水（最近 50 条）
router.get('/me/points/ledger', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT pool, direction, amount, reason, created_at
       FROM points_ledger WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ entries: rows });
});

// 每日签到 +10（进入 earned 累积余额；daily 字段展示今日获得）
router.post('/me/checkin', requireAuth, async (req, res) => {
  const result = await tx(async (db) => {
    const u = await db.query(
      `SELECT last_checkin_on = CURRENT_DATE AS checked_in_today
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [req.user.id]
    );
    if (u.rows[0]?.checked_in_today) {
      return { already: true };
    }
    await db.query('UPDATE users SET last_checkin_on = CURRENT_DATE WHERE id = $1', [req.user.id]);
    const cfg = await getSetting('points.daily_checkin');
    await awardPoints(db, req.user.id, 'points.daily_checkin', { force: true });
    const summary = await getPointsSummary(db, req.user.id);
    return { already: false, amount: cfg?.amount ?? 10, summary };
  });
  if (result.already) return res.status(409).json({ error: '今天已经签到过了' });
  res.json({
    ok: true,
    amount: result.amount,
    message: `签到成功，+${result.amount} 今日积分！`,
    ...result.summary,
  });
});

export default router;
