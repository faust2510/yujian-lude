// 认证：bcrypt 密码哈希 + session cookie token（存 sessions 表）
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, one } from './db.js';
import { config } from './config.js';

const COOKIE_NAME = 'yl_session';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function currentSessionToken(req) {
  return req.cookies?.[COOKIE_NAME] || null;
}

// 创建会话并写 cookie
export async function createSession(res, userId) {
  const token = newToken();
  const expires = new Date(Date.now() + config.sessionTtlDays * 86400_000);
  await query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expires]
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    expires,
    path: '/',
  });
  return token;
}

export async function destroySession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await query('DELETE FROM sessions WHERE token = $1', [token]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// 从 cookie 解析当前用户，挂到 req.user（不强制）
export async function attachUser(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next();
    const row = await one(
      `SELECT u.id, u.email, u.role, u.email_verified, u.vip_until, u.is_banned
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    if (row && !row.is_banned) {
      row.is_vip = row.vip_until && new Date(row.vip_until) > new Date();
      req.user = row;
    }
  } catch (err) {
    console.warn('[auth] attachUser 失败：', err.message);
  }
  next();
}

// 强制登录
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  next();
}

// 强制角色（如 admin）
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

export { COOKIE_NAME };
