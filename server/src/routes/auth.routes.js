// 认证路由：注册 / 登录 / 登出 / 当前用户 / 邮箱验证
import { Router } from 'express';
import crypto from 'node:crypto';
import { query, one, tx } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from '../auth.js';import { awardPoints, recomputeExposure } from '../lib/rewards.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 注册（邮箱 + 密码）
router.post('/register', async (req, res) => {
  const { email, password, nickname } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (!password || password.length < 8) return res.status(400).json({ error: '密码至少 8 位' });

  const exists = await one('SELECT 1 FROM users WHERE email=$1', [email]);
  if (exists) return res.status(409).json({ error: '该邮箱已注册' });

  const hash = await hashPassword(password);
  const user = await tx(async (db) => {
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role',
      [email, hash]
    );
    const u = rows[0];
    await db.query(
      'INSERT INTO profiles (user_id, nickname) VALUES ($1, $2)',
      [u.id, nickname || null]
    );
    await db.query('INSERT INTO points_balance (user_id, earned_total) VALUES ($1, 0)', [u.id]);
    await recomputeExposure(db, u.id); // 建立初始曝光行
    return u;
  });

  await createSession(res, user.id);
  res.status(201).json({ user: { id: user.id, email: user.email, role: user.role } });
});

// 登录
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });
  const u = await one(
    'SELECT id, email, role, password_hash, is_banned FROM users WHERE email=$1',
    [email]
  );
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  if (u.is_banned) return res.status(403).json({ error: '账号已被封禁' });
  await createSession(res, u.id);
  res.json({ user: { id: u.id, email: u.email, role: u.role } });
});

// 登出
router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

// 当前登录用户
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, email, role, email_verified, vip_until, is_vip } = req.user;
  res.json({ user: { id, email, role, email_verified, vip_until, is_vip } });
});

// 发送邮箱验证 token（MVP 直接返回 token；生产应发邮件）
router.post('/send-verify', requireAuth, async (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true, already: true });
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 24 * 3600_000);
  await query(
    'INSERT INTO email_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [req.user.id, token, expires]
  );
  // TODO 生产环境：发邮件含链接 /api/auth/verify?token=...
  // 开发期：token 只在非生产环境返回，方便本地点链接验证
  const devToken = process.env.NODE_ENV === 'production' ? undefined : token;
  res.json({ ok: true, ...(devToken ? { devToken } : {}) });
});

// 验证邮箱（点链接）→ 标记 verified + 发 20 积分
router.get('/verify', async (req, res) => {
  const { token } = req.query || {};
  if (!token) return res.status(400).json({ error: '缺少 token' });
  const row = await one(
    'SELECT user_id FROM email_tokens WHERE token=$1 AND expires_at > now()',
    [token]
  );
  if (!row) return res.status(400).json({ error: 'token 无效或已过期' });
  await tx(async (db) => {
    await db.query('UPDATE users SET email_verified=TRUE WHERE id=$1', [row.user_id]);
    await db.query('DELETE FROM email_tokens WHERE token=$1', [token]);
    await awardPoints(db, row.user_id, 'points.email_verified');
  });
  res.json({ ok: true });
});

// 修改密码
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: '请填写当前密码和新密码' });
  if (new_password.length < 8) return res.status(400).json({ error: '新密码至少 8 位' });
  const u = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!u || !(await verifyPassword(current_password, u.password_hash))) {
    return res.status(401).json({ error: '当前密码不正确' });
  }
  const hash = await hashPassword(new_password);
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ ok: true });
});

export default router;
