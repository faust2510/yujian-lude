// VIP / 积分兑换 路由
import { Router } from 'express';
import { tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { spendPoints, grantVipDays } from '../lib/rewards.js';
import { getSetting } from '../settings.js';

const router = Router();

// VIP 套餐信息（从 app_settings 读，管理员可改价）
router.get('/vip/plans', async (_req, res) => {
  const basic = await getSetting('pricing.vip_basic');
  const pro = await getSetting('pricing.vip_pro');
  res.json({
    plans: [
      { tier: 'basic', ...basic, perks: ['高级筛选', '谁看过我', '每日更多主动次数'] },
      { tier: 'pro', ...pro, perks: ['基础全部', '价值观/生活方式深度筛选', '优先顾问响应'] },
    ],
    note: 'VIP 只提供便利，不影响曝光排序。曝光只靠完成课程 + 牧者背书赢得。',
  });
});

// 积分兑换 VIP 体验天数（100 分 / 天）
router.post('/vip/redeem', requireAuth, async (req, res) => {
  const days = Math.max(1, Math.floor(Number(req.body?.days ?? 1)));
  const cfg = await getSetting('redeem.vip_per_day'); // {points:100, days:1}
  const costPerDay = cfg?.points ?? 100;
  const totalCost = costPerDay * days;
  const out = await tx(async (db) => {
    const ok = await spendPoints(db, req.user.id, totalCost, 'redeem_vip', null);
    if (!ok) return { ok: false };
    await grantVipDays(db, req.user.id, days);
    return { ok: true };
  });
  if (!out.ok) return res.status(402).json({ error: '积分不足', need: totalCost });
  res.json({ ok: true, daysGranted: days, spent: totalCost });
});

export default router;
