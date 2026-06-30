import crypto from 'node:crypto';

export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

export function normalizeEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

export function createPublicToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function dateFrom(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function loginWindowExpired(previous, now) {
  const lockedUntil = dateFrom(previous?.locked_until ?? previous?.lockedUntil);
  if (lockedUntil && lockedUntil <= now) return true;

  const lastFailedAt = dateFrom(previous?.last_failed_at ?? previous?.lastFailedAt);
  return !!lastFailedAt && now.getTime() - lastFailedAt.getTime() >= LOGIN_LOCKOUT_MINUTES * 60_000;
}

export function nextFailedLoginState(previous, now = new Date()) {
  const previousCount = loginWindowExpired(previous, now)
    ? 0
    : Number(previous?.failed_count ?? previous?.failedCount ?? 0);
  const failedCount = previousCount + 1;
  const lockedUntil =
    failedCount >= LOGIN_LOCKOUT_THRESHOLD
      ? new Date(now.getTime() + LOGIN_LOCKOUT_MINUTES * 60_000)
      : null;
  return { failedCount, lockedUntil };
}

export function isLocked(row, now = new Date()) {
  const lockedUntil = dateFrom(row?.locked_until ?? row?.lockedUntil);
  return !!lockedUntil && lockedUntil > now;
}
