import { validateAdminActorStatus, writeAdminAudit } from './admin-audit.js';

export const ADMIN_POINTS_MAX_ABS_AMOUNT = 1_000_000;

const ADMIN_POINTS_LEDGER_REASON = 'points.admin_adjustment';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminPointsError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function validateAdminPointsInput({ targetUserId, amount, reason } = {}) {
  if (!UUID_RE.test(targetUserId ?? '')) return { ok: false, error: '用户 ID 不正确' };
  if (!Number.isSafeInteger(amount)) return { ok: false, error: '积分必须是整数' };
  if (amount === 0) return { ok: false, error: '积分不能为 0' };
  if (Math.abs(amount) > ADMIN_POINTS_MAX_ABS_AMOUNT) {
    return { ok: false, error: `单次调整积分不能超过 ${ADMIN_POINTS_MAX_ABS_AMOUNT}` };
  }
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!normalizedReason) return { ok: false, error: '必须填写调整原因' };
  if (normalizedReason.length > 200) return { ok: false, error: '调整原因不能超过 200 字' };
  return {
    ok: true,
    value: { targetUserId, amount, reason: normalizedReason },
  };
}

export async function adjustAdminPoints(runInTransaction, input) {
  const validation = validateAdminPointsInput(input);
  if (!validation.ok) throw adminPointsError(400, validation.error);
  if (!UUID_RE.test(input?.actorId ?? '')) throw adminPointsError(403, '管理员身份无效');

  const { targetUserId, amount, reason } = validation.value;
  return runInTransaction(async (db) => {
    const actorResult = await db.query(
      'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
      [input.actorId],
    );
    const actorError = validateAdminActorStatus(actorResult.rows[0]);
    if (actorError) throw adminPointsError(403, actorError);

    const targetResult = await db.query(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      [targetUserId],
    );
    if (!targetResult.rows[0]) throw adminPointsError(404, '用户不存在');

    await db.query(
      `INSERT INTO points_balance (user_id, earned_total)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [targetUserId],
    );
    const balanceResult = await db.query(
      'SELECT earned_total FROM points_balance WHERE user_id = $1 FOR UPDATE',
      [targetUserId],
    );
    const previousBalance = balanceResult.rows[0]?.earned_total ?? 0;
    const nextBalance = previousBalance + amount;
    if (nextBalance < 0) throw adminPointsError(409, 'earned 积分余额不足，不能透支');

    const direction = amount > 0 ? 'credit' : 'debit';
    await db.query(
      `INSERT INTO points_ledger (user_id, pool, direction, amount, reason)
       VALUES ($1, 'earned', $2, $3, $4)`,
      [targetUserId, direction, Math.abs(amount), ADMIN_POINTS_LEDGER_REASON],
    );
    const updated = await db.query(
      `UPDATE points_balance
          SET earned_total = $2, updated_at = now()
        WHERE user_id = $1
        RETURNING earned_total`,
      [targetUserId, nextBalance],
    );
    await writeAdminAudit(db, {
      actorId: input.actorId,
      action: 'points.adjust',
      targetType: 'user',
      targetId: targetUserId,
      detail: { amount, direction, reason, previousBalance, balance: nextBalance },
    });

    return { balance: updated.rows[0]?.earned_total ?? nextBalance };
  });
}
