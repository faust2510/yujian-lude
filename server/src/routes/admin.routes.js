// 管理后台 路由 —— 改价格、改积分配置、看用户、审核背书
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { loadSettings, setSetting } from '../settings.js';
import { recomputeExposure } from '../lib/rewards.js';
import { buildEndorsementReviewPatch, validateEndorsementDecision } from '../lib/endorsement-review.js';
import { isAllowedAdminRole, writeAdminAudit } from '../lib/admin-audit.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// ---- 设置（价格/积分/兑换/额度，全部可改）----
router.get('/settings', async (_req, res) => {
  const s = await loadSettings(true);
  res.json({ settings: s });
});

router.put('/settings/:key', async (req, res) => {
  const { value } = req.body ?? {};
  if (value === undefined) return res.status(400).json({ error: '缺少 value' });
  await setSetting(req.params.key, value, req.user.id);
  await writeAdminAudit(query, {
    actorId: req.user.id,
    action: 'settings.update',
    targetType: 'setting',
    targetId: null,
    detail: { key: req.params.key },
  });
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
            (SELECT count(*)::int FROM endorsements e WHERE e.user_id = u.id AND e.state='verified') AS verified_endorsements
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC LIMIT 100`,
    params
  );
  res.json({ users: rows });
});

router.post('/users/:id/ban', async (req, res) => {
  const ban = req.body?.ban !== false;
  await tx(async (db) => {
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
  res.json({ ok: true, banned: ban });
});

router.post('/users/:id/role', async (req, res) => {
  const role = req.body?.role;
  if (!isAllowedAdminRole(role)) return res.status(400).json({ error: '非法角色' });
  await tx(async (db) => {
    await db.query('UPDATE users SET role = $2 WHERE id = $1', [req.params.id, role]);
    await writeAdminAudit(db, {
      actorId: req.user.id,
      action: 'user.role',
      targetType: 'user',
      targetId: req.params.id,
      detail: { role },
    });
  });
  res.json({ ok: true, role });
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
  const en = await one('SELECT user_id FROM endorsements WHERE id = $1', [req.params.id]);
  if (!en) return res.status(404).json({ error: '背书不存在' });
  const patch = buildEndorsementReviewPatch({ decision, reviewerId: req.user.id });
  await tx(async (db) => {
    await db.query(
      `UPDATE endorsements SET state = $2, verified_at = $3, verified_by = $4 WHERE id = $1`,
      [req.params.id, patch.state, patch.verifiedAt, patch.verifiedBy]
    );
    // 通过后重算曝光（背书 bonus 生效，进匹配池）
    if (decision === 'verified') await recomputeExposure(db, en.user_id);
    await writeAdminAudit(db, {
      actorId: req.user.id,
      action: 'endorsement.review',
      targetType: 'endorsement',
      targetId: req.params.id,
      detail: { decision, user_id: en.user_id },
    });
  });
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
