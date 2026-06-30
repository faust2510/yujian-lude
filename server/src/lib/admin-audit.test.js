import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditDetail,
  isAllowedAdminRole,
  normalizeReportAction,
  validateAdminActorStatus,
  validateAdminUserAction,
} from './admin-audit.js';

test('allows every user role supported by the schema', () => {
  assert.equal(isAllowedAdminRole('free'), true);
  assert.equal(isAllowedAdminRole('vip'), true);
  assert.equal(isAllowedAdminRole('pastor'), true);
  assert.equal(isAllowedAdminRole('admin'), true);
  assert.equal(isAllowedAdminRole('owner'), false);
});

test('normalizes report actions explicitly', () => {
  assert.equal(normalizeReportAction('resolve'), 'resolved');
  assert.equal(normalizeReportAction('dismiss'), 'dismissed');
  assert.equal(normalizeReportAction('anything-else'), null);
});

test('keeps audit detail serializable and compact', () => {
  assert.deepEqual(auditDetail({ decision: 'verified', extra: undefined }), { decision: 'verified' });
  assert.deepEqual(auditDetail(undefined), {});
});

test('rejects self-ban and self-demotion', () => {
  const actorId = 'admin-1';
  const targetUser = { id: actorId, role: 'admin', is_banned: false };

  assert.equal(
    validateAdminUserAction({ actorId, targetUser, action: 'ban', ban: true, activeAdminCount: 2 }),
    '不能封禁自己的管理员账号'
  );
  assert.equal(
    validateAdminUserAction({ actorId, targetUser, action: 'role', nextRole: 'vip', activeAdminCount: 2 }),
    '不能降低自己的管理员权限'
  );
});

test('protects the last active admin from ban or demotion', () => {
  const targetUser = { id: 'admin-1', role: 'admin', is_banned: false };

  assert.equal(
    validateAdminUserAction({ actorId: 'admin-2', targetUser, action: 'ban', ban: true, activeAdminCount: 1 }),
    '不能封禁最后一个有效管理员'
  );
  assert.equal(
    validateAdminUserAction({ actorId: 'admin-2', targetUser, action: 'role', nextRole: 'free', activeAdminCount: 1 }),
    '不能移除最后一个有效管理员'
  );
});

test('allows safe admin user operations', () => {
  assert.equal(
    validateAdminUserAction({
      actorId: 'admin-1',
      targetUser: { id: 'user-1', role: 'free', is_banned: false },
      action: 'ban',
      ban: true,
      activeAdminCount: 1,
    }),
    null
  );
  assert.equal(
    validateAdminUserAction({
      actorId: 'admin-1',
      targetUser: { id: 'admin-2', role: 'admin', is_banned: false },
      action: 'role',
      nextRole: 'vip',
      activeAdminCount: 2,
    }),
    null
  );
});

test('validates actor is still an active admin', () => {
  assert.equal(validateAdminActorStatus({ id: 'admin-1', role: 'admin', is_banned: false }), null);
  assert.equal(validateAdminActorStatus({ id: 'admin-1', role: 'vip', is_banned: false }), '管理员状态已失效，请重新登录');
  assert.equal(validateAdminActorStatus({ id: 'admin-1', role: 'admin', is_banned: true }), '管理员状态已失效，请重新登录');
});
