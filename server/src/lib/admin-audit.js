const ADMIN_ROLES = new Set(['free', 'vip', 'pastor', 'admin']);

export function isAllowedAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function normalizeReportAction(action) {
  if (action === 'resolve') return 'resolved';
  if (action === 'dismiss') return 'dismissed';
  return null;
}

export function validateAdminUserAction({
  actorId,
  targetUser,
  action,
  ban = false,
  nextRole,
  activeAdminCount = 0,
}) {
  if (!targetUser) return '用户不存在';
  const isSelf = String(actorId) === String(targetUser.id);
  const targetIsActiveAdmin = targetUser.role === 'admin' && targetUser.is_banned === false;
  const wouldRemoveActiveAdmin =
    targetIsActiveAdmin &&
    ((action === 'ban' && ban) || (action === 'role' && nextRole !== 'admin'));

  if (action === 'ban') {
    if (ban && isSelf) return '不能封禁自己的管理员账号';
    if (wouldRemoveActiveAdmin && activeAdminCount <= 1) return '不能封禁最后一个有效管理员';
    return null;
  }

  if (action === 'role') {
    if (isSelf && targetUser.role === 'admin' && nextRole !== 'admin') return '不能降低自己的管理员权限';
    if (wouldRemoveActiveAdmin && activeAdminCount <= 1) return '不能移除最后一个有效管理员';
    return null;
  }

  return '非法操作';
}

export function validateAdminActorStatus(actorUser) {
  if (!actorUser || actorUser.role !== 'admin' || actorUser.is_banned !== false) {
    return '管理员状态已失效，请重新登录';
  }
  return null;
}

export function auditDetail(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function writeAdminAudit(db, { actorId, action, targetType, targetId, detail }) {
  const runQuery = typeof db === 'function' ? db : db.query.bind(db);
  await runQuery(
    `INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(auditDetail(detail))]
  );
}
