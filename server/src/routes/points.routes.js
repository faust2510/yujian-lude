// 签到 + 积分 路由
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints } from '../lib/rewards.js';
import { getSetting } from '../settings.js';

const router = Router();

// 当前积分余额 + 今日是否已签到
router.get('/me/points', requireAuth, async (req, res) => {
  const bal = await one('SELECT earned_total FROM points_balance WHERE user_id = $1', [req.user.id]);
  const u = await one('SELECT last_checkin_on FROM users WHERE id = $1', [req.user.id]);
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    earned: bal?.earned_total ?? 0,
    checkedInToday: u?.last_checkin_on ? u.last_checkin_on.toISOString().slice(0, 10) === today : false,
  });
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

// 每日签到 +10（daily 池，当天清零；这里只发放并标记，清零由读取逻辑处理）
router.post('/me/checkin', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const result = await tx(async (db) => {
    const u = await db.query('SELECT last_checkin_on FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const last = u.rows[0]?.last_checkin_on;
    if (last && last.toISOString().slice(0, 10) === today) {
      return { already: true };
    }
    await db.query('UPDATE users SET last_checkin_on = CURRENT_DATE WHERE id = $1', [req.user.id]);
    const cfg = await getSetting('points.daily_checkin');
    await awardPoints(db, req.user.id, 'points.daily_checkin', { force: true });
    return { already: false, amount: cfg?.amount ?? 10 };
  });
  if (result.already) return res.status(409).json({ error: '今天已经签到过了' });
  res.json({ ok: true, amount: result.amount });
});

export default router;
