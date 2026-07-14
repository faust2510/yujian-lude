// VIP / 积分兑换 路由
import { Router } from 'express';
import { tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { spendPoints, grantVipDays } from '../lib/rewards.js';
import { calculateVipRedemptionCost } from '../lib/vip-redemption.js';
import { getSetting } from '../settings.js';

const router = Router();

function validateVipDays(req, res, next) {
  const days = req.body?.days ?? 1;
  if (!Number.isInteger(days) || days < 1) {
    return res.status(400).json({ error: '兑换天数必须是正整数' });
  }
  req.vipDays = days;
  next();
}

// VIP 套餐信息（从 app_settings 读，管理员可改价）
router.get('/vip/plans', async (_req, res) => {
  const basic = await getSetting('pricing.vip_basic');
  const pro = await getSetting('pricing.vip_pro');
  const redemption = await getSetting('redeem.vip_per_day');
  res.json({
    plans: [
      { tier: 'basic', ...basic, perks: ['高级筛选', '谁看过我', '每日更多主动次数'] },
      { tier: 'pro', ...pro, perks: ['基础全部', '价值观/生活方式深度筛选', '优先顾问响应'] },
    ],
    redemption: redemption ?? { points: 100, days: 1 },
    note: 'VIP 只提供便利，不影响曝光排序。曝光只靠完成课程 + 牧者背书赢得。',
  });
});

// 积分兑换 VIP 体验天数（比例由 app_settings 控制）
router.post('/vip/redeem', validateVipDays, requireAuth, async (req, res) => {
  const days = req.vipDays;
  const cfg = await getSetting('redeem.vip_per_day'); // {points:100, days:1}
  const redemption = cfg ?? { points: 100, days: 1 };
  const totalCost = calculateVipRedemptionCost(days, redemption);
  const out = await tx(async (db) => {
    const ok = await spendPoints(db, req.user.id, totalCost, 'redeem_vip', null);
    if (!ok) return { ok: false };
    await grantVipDays(db, req.user.id, days);
    return { ok: true };
  });
  if (!out.ok) return res.status(402).json({ error: '积分不足', need: totalCost });
  res.json({
    ok: true,
    daysGranted: days,
    spent: totalCost,
    redemption,
  });
});

export default router;
