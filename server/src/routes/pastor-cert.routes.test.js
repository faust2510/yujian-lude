import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import pastorCertificationRoutes from './pastor-cert.routes.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const APPLICANT_ID = '22222222-2222-4222-8222-222222222222';
const CERTIFICATION_ID = '33333333-3333-4333-8333-333333333333';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute({
  method,
  path,
  body,
  userId = ADMIN_ID,
  userRole = 'admin',
  dbRows,
}) {
  const calls = [];
  const originalConnect = pool.connect;
  let released = false;
  const client = {
    query: async (sql, params = []) => {
      const compact = compactSql(sql);
      calls.push({ sql: compact, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compact)) return { rows: [] };
      return { rows: await dbRows(compact, params) };
    },
    release: () => {
      released = true;
    },
  };
  pool.connect = async () => client;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, role: userRole, is_banned: false };
    next();
  });
  app.use(pastorCertificationRoutes);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      calls,
      released,
    };
  } finally {
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function successfulReviewDb({
  actor = { id: ADMIN_ID, role: 'admin', is_banned: false },
  certification = { id: CERTIFICATION_ID, user_id: APPLICANT_ID, state: 'pending' },
  applicant = { id: APPLICANT_ID, role: 'free', is_banned: false },
  auditError = null,
} = {}) {
  return async (sql, params) => {
    if (/pg_advisory_xact_lock/i.test(sql)) return [];
    if (/SELECT id, role, is_banned FROM users WHERE id = \$1 FOR UPDATE/i.test(sql)) {
      return params[0] === ADMIN_ID ? [actor] : [applicant];
    }
    if (/SELECT \* FROM pastor_certifications WHERE id = \$1 FOR UPDATE/i.test(sql)) {
      return certification ? [certification] : [];
    }
    if (/UPDATE users SET role = 'pastor'/i.test(sql)) return [{ id: APPLICANT_ID }];
    if (/UPDATE pastor_certifications/i.test(sql)) return [{ ...certification, state: params[1] }];
    if (/INSERT INTO admin_audit_logs/i.test(sql)) {
      if (auditError) throw auditError;
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('牧者认证申请把按立说明和见证实际写入同一 supporting_docs', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/pastor-cert/apply',
    userId: APPLICANT_ID,
    userRole: 'free',
    body: {
      church_name: ' 恩约教会 ',
      denomination: ' 改革宗 ',
      contact_email: ' pastor@example.com ',
      ordination_info: ' 2018 年按立 ',
      statement: ' 负责家庭事工 ',
    },
    dbRows: async (sql, params) => {
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        return [{ id: APPLICANT_ID, role: 'free', is_banned: false }];
      }
      if (/INSERT INTO pastor_certifications/i.test(sql)) {
        assert.deepEqual(JSON.parse(params[4]), {
          ordination_info: '2018 年按立',
          statement: '负责家庭事工',
        });
        return [{ id: CERTIFICATION_ID }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.id, CERTIFICATION_ID);
  assert.equal(result.calls.at(-1).sql, 'COMMIT');
  assert.equal(result.released, true);
});

test('非普通用户申请牧者认证会返回 403 并回滚', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/pastor-cert/apply',
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { church_name: '恩约教会', contact_email: 'admin@example.com' },
    dbRows: async (sql) => {
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        return [{ id: ADMIN_ID, role: 'admin', is_banned: false }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO pastor_certifications/i.test(sql)), false);
});

test('重复 pending 申请返回 409 并回滚', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/pastor-cert/apply',
    userId: APPLICANT_ID,
    userRole: 'free',
    body: { church_name: '恩约教会', contact_email: 'pastor@example.com' },
    dbRows: async (sql) => {
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        return [{ id: APPLICANT_ID, role: 'free', is_banned: false }];
      }
      if (/INSERT INTO pastor_certifications/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 409);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
});

test('非法审核 action 在打开事务前返回 400', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
    body: { action: 'archive' },
    dbRows: async (sql) => {
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
});

test('非法认证申请 ID 在打开事务前返回 400', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: '/pastor-cert/applications/not-a-uuid',
    body: { action: 'approve' },
    dbRows: async (sql) => {
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
});

test('事务内已撤权的管理员不能完成牧者认证审核', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
    body: { action: 'approve' },
    dbRows: successfulReviewDb({ actor: { id: ADMIN_ID, role: 'free', is_banned: false } }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => /FROM pastor_certifications/i.test(sql)), false);
});

test('管理员不能审核自己的牧者认证申请', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
    body: { action: 'approve' },
    dbRows: successfulReviewDb({
      certification: { id: CERTIFICATION_ID, user_id: ADMIN_ID, state: 'pending' },
      applicant: { id: ADMIN_ID, role: 'admin', is_banned: false },
    }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => /UPDATE users SET role = 'pastor'/i.test(sql)), false);
});

test('已处理的牧者认证申请返回 409', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
    body: { action: 'approve' },
    dbRows: successfulReviewDb({
      certification: { id: CERTIFICATION_ID, user_id: APPLICANT_ID, state: 'approved' },
    }),
  });

  assert.equal(result.status, 409);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
});

test('管理员申请人绝不会被批准为 pastor', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
    body: { action: 'approve' },
    dbRows: successfulReviewDb({
      applicant: { id: APPLICANT_ID, role: 'admin', is_banned: false },
    }),
  });

  assert.equal(result.status, 409);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => /UPDATE users SET role = 'pastor'/i.test(sql)), false);
});

test('批准牧者认证会在同一事务中安全提升角色、更新申请并写审计', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
    body: { action: 'approve' },
    dbRows: successfulReviewDb(),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.certification.state, 'approved');
  const roleUpdate = result.calls.find(({ sql }) => /UPDATE users SET role = 'pastor'/i.test(sql));
  assert.match(roleUpdate.sql, /role = 'free' AND is_banned = FALSE/i);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO admin_audit_logs/i.test(sql)), true);
  assert.equal(result.calls.at(-1).sql, 'COMMIT');
  assert.deepEqual(
    result.calls.map(({ sql, params }) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return sql;
      if (/pg_advisory_xact_lock/i.test(sql)) return 'LOCK_ADMIN_OPERATIONS';
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        return params[0] === ADMIN_ID ? 'LOCK_ACTOR' : 'LOCK_APPLICANT';
      }
      if (/SELECT \* FROM pastor_certifications/i.test(sql)) return 'LOCK_CERTIFICATION';
      if (/UPDATE users SET role = 'pastor'/i.test(sql)) return 'PROMOTE_APPLICANT';
      if (/UPDATE pastor_certifications/i.test(sql)) return 'UPDATE_CERTIFICATION';
      if (/INSERT INTO admin_audit_logs/i.test(sql)) return 'WRITE_AUDIT';
      return sql;
    }),
    [
      'BEGIN',
      'LOCK_ADMIN_OPERATIONS',
      'LOCK_ACTOR',
      'LOCK_CERTIFICATION',
      'LOCK_APPLICANT',
      'PROMOTE_APPLICANT',
      'UPDATE_CERTIFICATION',
      'WRITE_AUDIT',
      'COMMIT',
    ]
  );
});

test('审计写入失败会回滚牧者角色和认证状态变更', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await requestRoute({
      method: 'PATCH',
      path: `/pastor-cert/applications/${CERTIFICATION_ID}`,
      body: { action: 'approve' },
      dbRows: successfulReviewDb({ auditError: new Error('audit unavailable') }),
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(result.status, 500);
  assert.equal(result.calls.some(({ sql }) => /UPDATE users SET role = 'pastor'/i.test(sql)), true);
  assert.equal(result.calls.some(({ sql }) => /UPDATE pastor_certifications/i.test(sql)), true);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => sql === 'COMMIT'), false);
});
