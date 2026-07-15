// 管理后台 路由 —— 改价格、改积分配置、看用户、审核背书
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { invalidateSettings, loadSettings, setSetting, settingsToAdminRows, validateSettingUpdate } from '../settings.js';
import { awardPoints, grantVipTierDays, recomputeAllExposure, recomputeExposure } from '../lib/rewards.js';
import { buildEndorsementReviewPatch, canReviewEndorsement, validateEndorsementDecision } from '../lib/endorsement-review.js';
import { isAllowedAdminRole, isAssignableAdminRole, validateAdminActorStatus, validateAdminUserAction, writeAdminAudit } from '../lib/admin-audit.js';
import { normalizeVipSubscriptionReview } from '../lib/vip-subscription.js';
import { adjustAdminPoints } from '../lib/admin-points.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const ADMIN_USER_OP_LOCK_KEY = 871406252;
const EXPOSURE_SETTING_KEYS = new Set(['exposure.base', 'exposure.endorsement_bonus', 'course.exposure_multiplier']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuidParam(_req, res, next, value) {
  if (!UUID_RE.test(value)) return res.status(400).json({ error: 'ID 格式不正确' });
  next();
}

router.param('id', validateUuidParam);

const INTEGER_SETTING_FIELDS = new Map([
  ['points.daily_checkin', ['amount']],
  ['points.profile_complete', ['amount']],
  ['points.endorsement_done', ['amount']],
  ['points.email_verified', ['amount']],
  ['points.course_complete', ['amount']],
  ['points.intent_sent', ['amount', 'daily_cap']],
  ['redeem.vip_per_day', ['points', 'days']],
  ['course.completion_vip_days', ['days']],
  ['exposure.base', ['value']],
  ['exposure.endorsement_bonus', ['value']],
  ['limits.daily_intents_free', ['value']],
  ['limits.daily_intents_vip', ['value']],
]);

export function getAdminIntegerSettingError(key, value) {
  for (const field of INTEGER_SETTING_FIELDS.get(key) ?? []) {
    if (!Number.isSafeInteger(value?.[field]) || value[field] > 2_147_483_647) {
      return `${field} 必须是整数`;
    }
  }
  return null;
}

function routeError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sendRouteError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('[admin] 高危操作失败：', err.message);
  return res.status(500).json({ error: '后台操作失败' });
}

// ---- 设置（价格/积分/兑换/额度，全部可改）----
router.get('/settings', async (_req, res) => {
  const s = await loadSettings(true);
  res.json({ settings: settingsToAdminRows(s) });
});

router.put('/settings/:key', async (req, res) => {
  const { value } = req.body ?? {};
  if (value === undefined) return res.status(400).json({ error: '缺少 value' });
  const validation = validateSettingUpdate(req.params.key, value);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  const integerError = getAdminIntegerSettingError(req.params.key, validation.value);
  if (integerError) return res.status(400).json({ error: integerError });
  try {
    await tx(async (db) => {
      if (EXPOSURE_SETTING_KEYS.has(req.params.key)) {
        await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_USER_OP_LOCK_KEY]);
      }
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);
      await setSetting(req.params.key, validation.value, req.user.id, db);
      if (EXPOSURE_SETTING_KEYS.has(req.params.key)) await recomputeAllExposure(db);
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: 'settings.update',
        targetType: 'setting',
        targetId: null,
        detail: { key: req.params.key },
      });
    });
    invalidateSettings();
  } catch (err) {
    return sendRouteError(res, err);
  }
  res.json({ ok: true });
});

// ---- 用户管理 ----
router.get('/users', async (req, res) => {
  const filters = [];
  const params = [];
  const q = (req.query.q ?? '').toString().trim();
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(u.email ILIKE $${params.length} OR p.nickname ILIKE $${params.length})`);
  }
  const role = (req.query.role ?? '').toString();
  if (role && isAllowedAdminRole(role)) {
    params.push(role);
    filters.push(`u.role = $${params.length}`);
  }
  const banned = (req.query.banned ?? '').toString();
  if (['true', 'false'].includes(banned)) {
    params.push(banned === 'true');
    filters.push(`u.is_banned = $${params.length}`);
  }
  const emailVerified = (req.query.email_verified ?? '').toString();
  if (['true', 'false'].includes(emailVerified)) {
    params.push(emailVerified === 'true');
    filters.push(`u.email_verified = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT u.id, u.email, u.role, u.email_verified, u.vip_until, u.is_banned, u.created_at,
            p.nickname, p.city,
            COALESCE(pb.earned_total, 0)::int AS earned_points,
            (SELECT count(*)::int FROM endorsements e WHERE e.user_id = u.id AND e.state='verified') AS verified_endorsements
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN points_balance pb ON pb.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC LIMIT 100`,
    params
  );
  res.json({ users: rows });
});

router.post('/users/:id/points', async (req, res) => {
  try {
    const result = await adjustAdminPoints(tx, {
      actorId: req.user.id,
      targetUserId: req.params.id,
      operationId: req.body?.operation_id,
      amount: req.body?.amount,
      reason: req.body?.reason,
    });
    return res.json({ ok: true, balance: result.balance, idempotent: result.idempotent });
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/users/:id/ban', async (req, res) => {
  if (typeof req.body?.ban !== 'boolean') {
    return res.status(400).json({ error: 'ban 必须是布尔值' });
  }
  const ban = req.body.ban;
  try {
    await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_USER_OP_LOCK_KEY]);
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);
      const { rows } = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const targetUser = rows[0];
      if (!targetUser) throw routeError(404, '用户不存在');
      const activeAdmins = await db.query(
        `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_banned = FALSE`
      );
      const error = validateAdminUserAction({
        actorId: req.user.id,
        targetUser,
        action: 'ban',
        ban,
        activeAdminCount: activeAdmins.rows[0]?.n ?? 0,
      });
      if (error) throw routeError(400, error);
      await db.query('UPDATE users SET is_banned = $2 WHERE id = $1', [req.params.id, ban]);
      if (ban) await db.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: ban ? 'user.ban' : 'user.unban',
        targetType: 'user',
        targetId: req.params.id,
        detail: { ban },
      });
    });
  } catch (err) {
    return sendRouteError(res, err);
  }
  res.json({ ok: true, banned: ban });
});

router.post('/users/:id/role', async (req, res) => {
  const role = req.body?.role;
  if (!isAssignableAdminRole(role)) return res.status(400).json({ error: '非法角色；VIP 权益请通过订阅审核或奖励发放' });
  try {
    await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_USER_OP_LOCK_KEY]);
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);
      const { rows } = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const targetUser = rows[0];
      if (!targetUser) throw routeError(404, '用户不存在');
      const activeAdmins = await db.query(
        `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_banned = FALSE`
      );
      const error = validateAdminUserAction({
        actorId: req.user.id,
        targetUser,
        action: 'role',
        nextRole: role,
        activeAdminCount: activeAdmins.rows[0]?.n ?? 0,
      });
      if (error) throw routeError(400, error);
      await db.query('UPDATE users SET role = $2 WHERE id = $1', [req.params.id, role]);
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: 'user.role',
        targetType: 'user',
        targetId: req.params.id,
        detail: { role },
      });
    });
  } catch (err) {
    return sendRouteError(res, err);
  }
  res.json({ ok: true, role });
});

router.get('/vip-subscriptions', async (req, res) => {
  const state = String(req.query.state || 'pending');
  if (!['pending', 'approved', 'rejected', 'cancelled'].includes(state)) {
    return res.status(400).json({ error: '申请状态不正确' });
  }
  const { rows } = await query(
    `SELECT r.*, u.email, p.nickname,
            reviewer.email AS reviewer_email, reviewer_profile.nickname AS reviewer_nickname
       FROM vip_subscription_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       LEFT JOIN profiles reviewer_profile ON reviewer_profile.user_id = r.reviewed_by
      WHERE r.state = $1
      ORDER BY r.created_at ASC
      LIMIT 100`,
    [state]
  );
  res.json({ subscriptions: rows });
});

router.patch('/vip-subscriptions/:id', async (req, res) => {
  const normalized = normalizeVipSubscriptionReview({
    action: req.body?.action,
    note: req.body?.note,
    paymentConfirmationReference: req.body?.payment_confirmation_reference,
  });
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });

  try {
    const out = await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_USER_OP_LOCK_KEY]);
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);

      const requestResult = await db.query(
        `SELECT * FROM vip_subscription_requests WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      const subscription = requestResult.rows[0];
      if (!subscription) throw routeError(404, 'VIP 申请不存在');
      if (subscription.user_id === req.user.id) throw routeError(403, '不能审核自己的 VIP 申请');
      if (subscription.state !== 'pending') throw routeError(409, 'VIP 申请状态已变化，请刷新后重试');

      let activatedUntil = null;
      if (normalized.value.state === 'approved') {
        activatedUntil = await grantVipTierDays(db, subscription.user_id, subscription.tier, subscription.duration_days);
        if (!activatedUntil) throw routeError(404, '申请用户不存在');
      }

      const updated = await db.query(
        `UPDATE vip_subscription_requests
            SET state = $2::vip_subscription_state,
                reviewed_by = $3,
                reviewed_at = now(),
                review_note = $4,
                activated_until = $5,
                payment_confirmation_reference = $6,
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [
          subscription.id,
          normalized.value.state,
          req.user.id,
          normalized.value.reviewNote,
          activatedUntil,
          normalized.value.paymentConfirmationReference,
        ]
      );
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: 'vip.subscription_review',
        targetType: 'vip_subscription',
        targetId: subscription.id,
        detail: {
          state: normalized.value.state,
          user_id: subscription.user_id,
          amount_minor: subscription.amount_minor,
          currency: subscription.currency,
          duration_days: subscription.duration_days,
          tier: subscription.tier,
          activated_until: activatedUntil,
        },
      });
      return updated.rows[0];
    });
    res.json({ ok: true, subscription: out });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '该核款凭据已用于其他申请，请重新核对' });
    }
    return sendRouteError(res, err);
  }
});

// ---- 背书审核（MVP 人工抽查：管理员改 state）----
router.get('/endorsements', async (req, res) => {
  const state = req.query.state ?? 'pending';
  const { rows } = await query(
    `SELECT e.id, e.user_id, e.kind, e.name, e.contact, e.church, e.state, e.note, e.created_at,
            u.email, p.nickname
       FROM endorsements e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN profiles p ON p.user_id = e.user_id
      WHERE e.state = $1 ORDER BY e.created_at ASC LIMIT 100`,
    [state]
  );
  res.json({ endorsements: rows });
});

router.post('/endorsements/:id/review', async (req, res) => {
  const decision = req.body?.decision; // 'verified' | 'rejected'
  if (!validateEndorsementDecision(decision)) return res.status(400).json({ error: '非法决定' });
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: '背书 ID 格式不正确' });
  try {
    await tx(async (db) => {
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);

      const locked = await db.query(
        `SELECT user_id, kind, contact, state
           FROM endorsements
          WHERE id = $1
          FOR UPDATE`,
        [req.params.id]
      );
      const en = locked.rows[0];
      if (!en) throw routeError(404, '背书不存在');
      if (en.user_id === req.user.id) throw routeError(403, '不能审核自己的背书');
      if (!canReviewEndorsement(en.state, decision)) {
        throw routeError(409, '背书已被审核，请刷新后重试');
      }

      const patch = buildEndorsementReviewPatch({ decision, reviewerId: req.user.id });
      let endorserUserId = null;
      if (decision === 'verified') {
        const linked = await db.query(
          `SELECT u.id
             FROM users u
            WHERE LOWER(BTRIM(u.email)) = LOWER(BTRIM($1))
              AND u.id <> $2
              AND u.email_verified = TRUE
              AND u.is_banned = FALSE
              AND ($3 = 'referrer' OR u.role = 'pastor')
            LIMIT 1`,
          [en.contact, en.user_id, en.kind]
        );
        endorserUserId = linked.rows[0]?.id ?? null;
      }
      const updated = await db.query(
        `UPDATE endorsements
            SET state = $2, verified_at = $3, verified_by = $4, endorser_user_id = $5
          WHERE id = $1 AND state = 'pending'
          RETURNING id`,
        [req.params.id, patch.state, patch.verifiedAt, patch.verifiedBy, endorserUserId]
      );
      if (!updated.rows.length) throw routeError(409, '背书已被审核，请刷新后重试');

      if (decision === 'verified') {
        await awardPoints(db, en.user_id, 'points.endorsement_done', { refId: req.params.id });
        await recomputeExposure(db, en.user_id);
      }
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: 'endorsement.review',
        targetType: 'endorsement',
        targetId: req.params.id,
        detail: {
          decision,
          user_id: en.user_id,
          endorser_user_id: endorserUserId,
        },
      });
    });
  } catch (err) {
    return sendRouteError(res, err);
  }
  res.json({ ok: true, decision });
});

// ---- 概览统计 ----
router.get('/stats', async (_req, res) => {
  const u = await one('SELECT count(*)::int AS n FROM users');
  const vip = await one(`SELECT count(*)::int AS n FROM users WHERE vip_until > now()`);
  const pend = await one(`SELECT count(*)::int AS n FROM endorsements WHERE state='pending'`);
  const done = await one(`SELECT count(*)::int AS n FROM course_progress WHERE state='completed'`);
  const reports = await one(`SELECT count(*)::int AS n FROM community_reports WHERE state='pending'`);
  const pastorCerts = await one(`SELECT count(*)::int AS n FROM pastor_certifications WHERE state='pending'`);
  const communityAdmins = await one(`SELECT count(*)::int AS n FROM community_admin_applications WHERE state='pending'`);
  const vipSubscriptions = await one(`SELECT count(*)::int AS n FROM vip_subscription_requests WHERE state='pending'`);
  const { rows: auditLogs } = await query(
    `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
            u.email AS actor_email, p.nickname AS actor_nickname
       FROM admin_audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN profiles p ON p.user_id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT 20`
  );
  res.json({
    users: u.n,
    vip: vip.n,
    pendingEndorsements: pend.n,
    courseCompletions: done.n,
    pendingReports: reports.n,
    pendingPastorCertifications: pastorCerts.n,
    pendingCommunityAdminApplications: communityAdmins.n,
    pendingVipSubscriptions: vipSubscriptions.n,
    auditLogs,
  });
});

router.get('/audit-logs', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
            u.email AS actor_email, p.nickname AS actor_nickname
       FROM admin_audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN profiles p ON p.user_id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT 100`
  );
  res.json({ auditLogs: rows });
});

export default router;
