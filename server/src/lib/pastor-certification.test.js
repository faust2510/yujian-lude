import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..');
const libraryPath = path.join(__dirname, 'pastor-certification.js');

test('牧者认证申请会规范化资料并同时保存按立说明和见证', async () => {
  assert.equal(existsSync(libraryPath), true, 'pastor-certification.js should exist');
  const { normalizePastorCertificationApplication } = await import(pathToFileURL(libraryPath));

  assert.deepEqual(normalizePastorCertificationApplication({
    churchName: ' 恩约教会 ',
    denomination: ' 改革宗 ',
    contactEmail: ' pastor@example.com ',
    ordinationInfo: ' 2018 年按立 ',
    statement: ' 目前负责家庭事工 ',
  }), {
    ok: true,
    value: {
      churchName: '恩约教会',
      denomination: '改革宗',
      contactEmail: 'pastor@example.com',
      supportingDocs: {
        ordination_info: '2018 年按立',
        statement: '目前负责家庭事工',
      },
    },
  });

  assert.match(normalizePastorCertificationApplication({ contactEmail: 'pastor@example.com' }).error, /教会/);
  assert.match(normalizePastorCertificationApplication({ churchName: '恩约教会' }).error, /联系方式/);
  let invalidChurch;
  assert.doesNotThrow(() => {
    invalidChurch = normalizePastorCertificationApplication({
      churchName: { toString: null },
      contactEmail: 'pastor@example.com',
    });
  });
  assert.match(invalidChurch.error, /教会.*格式/);
  assert.match(normalizePastorCertificationApplication({
    churchName: '恩约教会',
    contactEmail: ['pastor@example.com'],
  }).error, /联系方式.*格式/);
  assert.match(normalizePastorCertificationApplication({
    churchName: '恩约教会',
    contactEmail: 'pastor@example.com',
    statement: 'a'.repeat(5001),
  }).error, /事奉说明.*5000/);
});

test('牧者认证审核拒绝自审和不安全的角色提升', async () => {
  assert.equal(existsSync(libraryPath), true, 'pastor-certification.js should exist');
  const {
    validatePastorCertificationApplicant,
    validatePastorCertificationReview,
  } = await import(pathToFileURL(libraryPath));

  assert.equal(validatePastorCertificationApplicant({ role: 'free', is_banned: false }), null);
  assert.match(validatePastorCertificationApplicant({ role: 'admin', is_banned: false }), /普通用户/);
  assert.match(validatePastorCertificationApplicant({ role: 'pastor', is_banned: false }), /普通用户/);

  assert.match(validatePastorCertificationReview({
    actorId: 'user-1',
    certification: { user_id: 'user-1', state: 'pending' },
    applicant: { role: 'free', is_banned: false },
    action: 'approve',
  }), /自己/);
  assert.match(validatePastorCertificationReview({
    actorId: 'admin-1',
    certification: { user_id: 'user-1', state: 'pending' },
    applicant: { role: 'admin', is_banned: false },
    action: 'approve',
  }), /普通用户/);
  assert.match(validatePastorCertificationReview({
    actorId: 'admin-1',
    certification: { user_id: 'user-1', state: 'pending' },
    applicant: { role: 'free', is_banned: true },
    action: 'approve',
  }), /账号状态/);
  assert.equal(validatePastorCertificationReview({
    actorId: 'admin-1',
    certification: { user_id: 'user-1', state: 'pending' },
    applicant: { role: 'free', is_banned: false },
    action: 'reject',
  }), null);
});

test('牧者认证路由在事务内重新校验管理员、锁定申请并限制角色更新', () => {
  const source = readFileSync(path.join(srcRoot, 'routes', 'pastor-cert.routes.js'), 'utf8');

  assert.match(source, /ordinationInfo:\s*req\.body\?\.ordination_info/);
  assert.match(source, /ON CONFLICT \(user_id\) WHERE state = 'pending' DO NOTHING/);
  assert.match(source, /validateAdminActorStatus\(actor\.rows\[0\]\)/);
  assert.match(source, /SELECT \* FROM pastor_certifications WHERE id = \$1 FOR UPDATE/);
  assert.match(source, /SELECT id, role, is_banned FROM users WHERE id = \$1 FOR UPDATE/);
  assert.match(source, /UPDATE users SET role = 'pastor' WHERE id = \$1 AND role = 'free' AND is_banned = FALSE/);
});
