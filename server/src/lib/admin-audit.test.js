import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditDetail,
  isAllowedAdminRole,
  normalizeReportAction,
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
