// VIP / 积分兑换 路由
import { Router } from 'express';
import { one, query, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { spendPoints, grantVipDays } from '../lib/rewards.js';
import { calculateVipRedemptionCost } from '../lib/vip-redemption.js';
import { getSetting } from '../settings.js';
import {
  buildVipPlanSnapshot,
  normalizeVipSubscriptionRequest,
} from '../lib/vip-subscription.js';

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
      { tier: 'basic', ...basic, perks: ['每日主动次数提升至 15 次', '查看谁看过我'] },
      { tier: 'pro', ...pro, perks: ['包含 Basic 全部权益', '使用学历、婚恋目标、区会等深度筛选'] },
    ],
    redemption: redemption ?? { points: 100, days: 1 },
    note: 'VIP 只提供便利，不影响曝光排序。曝光只靠完成课程 + 牧者背书赢得。',
  });
});

router.get('/vip/subscriptions', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.tier, r.plan_snapshot, r.amount_minor, r.currency,
            r.duration_days, r.payment_reference, r.applicant_note, r.state,
            r.review_note, r.reviewed_at, r.activated_until, r.created_at, r.updated_at,
            reviewer_profile.nickname AS reviewer_nickname
       FROM vip_subscription_requests r
       LEFT JOIN profiles reviewer_profile ON reviewer_profile.user_id = r.reviewed_by
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT 50`,
    [req.user.id]
  );
  res.json({ subscriptions: rows, pending: rows.find((item) => item.state === 'pending') ?? null });
});

router.post('/vip/subscriptions', requireAuth, async (req, res) => {
  const normalized = normalizeVipSubscriptionRequest({
    tier: req.body?.tier,
    paymentReference: req.body?.payment_reference,
    applicantNote: req.body?.applicant_note,
  });
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });

  const plan = await getSetting(`pricing.vip_${normalized.value.tier}`);
  const snapshot = buildVipPlanSnapshot(normalized.value.tier, plan);
  if (!snapshot.ok) return res.status(409).json({ error: snapshot.error });

  const row = await one(
    `INSERT INTO vip_subscription_requests
       (user_id, tier, plan_snapshot, amount_minor, currency, duration_days,
        payment_reference, applicant_note)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) WHERE state = 'pending' DO NOTHING
     RETURNING *`,
    [
      req.user.id,
      snapshot.value.tier,
      JSON.stringify(snapshot.value),
      snapshot.value.amountMinor,
      snapshot.value.currency,
      snapshot.value.durationDays,
      normalized.value.paymentReference,
      normalized.value.applicantNote,
    ]
  );
  if (!row) return res.status(409).json({ error: '已有待核款申请，请勿重复提交' });
  res.status(201).json({ ok: true, subscription: row });
});

router.delete('/vip/subscriptions/:id', requireAuth, async (req, res) => {
  const row = await one(
    `UPDATE vip_subscription_requests
        SET state = 'cancelled', updated_at = now()
      WHERE id = $1 AND user_id = $2 AND state = 'pending'
      RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (!row) return res.status(404).json({ error: '待核款申请不存在或已处理' });
  res.json({ ok: true, subscription: row });
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
