const ADMIN_ROLES = new Set(['free', 'vip', 'pastor', 'admin']);

export function isAllowedAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function normalizeReportAction(action) {
  if (action === 'resolve') return 'resolved';
  if (action === 'dismiss') return 'dismissed';
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
