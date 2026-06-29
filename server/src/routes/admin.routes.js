// 管理后台 路由 —— 改价格、改积分配置、看用户、审核背书
import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { loadSettings, setSetting } from '../settings.js';
import { recomputeExposure } from '../lib/rewards.js';
import { tx } from '../db.js';
import { buildEndorsementReviewPatch, validateEndorsementDecision } from '../lib/endorsement-review.js';

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
  res.json({ ok: true });
});

// ---- 用户管理 ----
router.get('/users', async (req, res) => {
  const q = `%${(req.query.q ?? '').toString()}%`;
  const { rows } = await query(
    `SELECT u.id, u.email, u.role, u.email_verified, u.vip_until, u.is_banned, u.created_at,
            p.nickname, p.city,
            (SELECT count(*)::int FROM endorsements e WHERE e.user_id = u.id AND e.state='verified') AS verified_endorsements
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE ($1 = '%%' OR u.email ILIKE $1 OR p.nickname ILIKE $1)
      ORDER BY u.created_at DESC LIMIT 100`,
    [q]
  );
  res.json({ users: rows });
});

router.post('/users/:id/ban', async (req, res) => {
  const ban = req.body?.ban !== false;
  await query('UPDATE users SET is_banned = $2 WHERE id = $1', [req.params.id, ban]);
  res.json({ ok: true, banned: ban });
});

router.post('/users/:id/role', async (req, res) => {
  const role = req.body?.role;
  if (!['free', 'vip', 'admin'].includes(role)) return res.status(400).json({ error: '非法角色' });
  await query('UPDATE users SET role = $2 WHERE id = $1', [req.params.id, role]);
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
  });
  res.json({ ok: true, decision });
});

// ---- 概览统计 ----
router.get('/stats', async (_req, res) => {
  const u = await one('SELECT count(*)::int AS n FROM users');
  const vip = await one(`SELECT count(*)::int AS n FROM users WHERE vip_until > now()`);
  const pend = await one(`SELECT count(*)::int AS n FROM endorsements WHERE state='pending'`);
  const done = await one(`SELECT count(*)::int AS n FROM course_progress WHERE state='completed'`);
  res.json({ users: u.n, vip: vip.n, pendingEndorsements: pend.n, courseCompletions: done.n });
});

export default router;
