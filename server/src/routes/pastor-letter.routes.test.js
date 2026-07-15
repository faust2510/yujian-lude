import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import pastorLetterRoutes from './pastor-letter.routes.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const LETTER_ID = '44444444-4444-4444-8444-444444444444';
const LETTER_UPDATED_AT = '2026-07-15T00:00:00.000Z';

test.after(async () => {
  await pool.end();
});

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute({
  method = 'GET',
  path,
  body,
  userId = USER_ID,
  userRole = 'free',
  dbRows,
}) {
  const calls = [];
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const run = async (sql, params = [], transaction = false) => {
    const compact = compactSql(sql);
    calls.push({ sql: compact, params, transaction });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compact)) return { rows: [] };
    return { rows: await dbRows(compact, params, transaction) };
  };
  pool.query = (sql, params) => run(sql, params, false);
  pool.connect = async () => ({
    query: (sql, params) => run(sql, params, true),
    release() {},
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, role: userRole, is_banned: false };
    next();
  });
  app.use(pastorLetterRoutes);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let responseBody;
    try { responseBody = JSON.parse(text); } catch { responseBody = { error: text }; }
    return { status: response.status, body: responseBody, calls };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('保存牧者介绍信会写入全部字段并撤销旧核验', async () => {
  const result = await requestRoute({
    method: 'PUT',
    path: '/me/pastor-letter',
    body: {
      pastor_name: ' 王牧师 ',
      pastor_contact: ' pastor@example.com ',
      family_note: ' 家庭情况 ',
      faith_note: ' 信仰情况 ',
      spiritual_note: ' 属灵生命 ',
      church_life_note: ' 教会生活 ',
    },
    dbRows: async (sql, params) => {
      if (/INSERT INTO pastor_letters/i.test(sql)) {
        assert.deepEqual(params, [
          USER_ID,
          '王牧师',
          'pastor@example.com',
          '家庭情况',
          '信仰情况',
          '属灵生命',
          '教会生活',
        ]);
        assert.match(sql, /is_verified\s*=\s*CASE[\s\S]*THEN FALSE/i);
        assert.match(sql, /verified_by\s*=\s*CASE[\s\S]*THEN NULL/i);
        assert.match(sql, /verified_at\s*=\s*CASE[\s\S]*THEN NULL/i);
        assert.match(sql, /IS DISTINCT FROM/i);
        assert.match(sql, /ELSE pastor_letters\.is_verified END/i);
        assert.match(sql, /ELSE pastor_letters\.verified_by END/i);
        assert.match(sql, /ELSE pastor_letters\.verified_at END/i);
        assert.match(sql, /ELSE pastor_letters\.updated_at END/i);
        return [{ id: LETTER_ID, is_verified: false, verified_by: ADMIN_ID }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.letter.is_verified, false);
  assert.equal(Object.hasOwn(result.body.letter, 'verified_by'), false);
  assert.doesNotMatch(result.calls.find((call) => /INSERT INTO pastor_letters/i.test(call.sql)).sql, /RETURNING \*/i);
  assert.equal(result.calls.at(-1).sql, 'COMMIT');
});

test('管理员列表返回介绍信材料和申请人身份', async () => {
  const result = await requestRoute({
    path: '/pastor-letters?page=2',
    userId: ADMIN_ID,
    userRole: 'admin',
    dbRows: async (sql) => {
      if (/COUNT\(\*\)/i.test(sql)) return [{ total: 101 }];
      if (/FROM pastor_letters/i.test(sql)) {
        return [{ id: LETTER_ID, user_id: USER_ID, pastor_name: '王牧师', email: 'user@example.com' }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.letters[0].id, LETTER_ID);
  assert.equal(result.body.total, 101);
  assert.equal(result.body.page, 2);
  assert.equal(result.body.pageSize, 50);
  assert.match(result.calls[1].sql, /l\.updated_at::text AS updated_at/i);
  assert.match(result.calls[1].sql, /ORDER BY l\.is_verified ASC, l\.updated_at DESC, l\.id DESC/i);
  assert.match(result.calls[1].sql, /LIMIT \$1 OFFSET \$2/i);
  assert.deepEqual(result.calls[1].params, [50, 50]);
});

function reviewDb({
  actor = { id: ADMIN_ID, role: 'admin', is_banned: false },
  letter = {
    id: LETTER_ID,
    user_id: USER_ID,
    is_verified: false,
    updated_at: LETTER_UPDATED_AT,
    updated_at_version: LETTER_UPDATED_AT,
  },
  auditError = null,
} = {}) {
  return async (sql, params) => {
    if (/pg_advisory_xact_lock/i.test(sql)) return [];
    if (/SELECT id, role, is_banned FROM users/i.test(sql)) return [actor];
    if (/SELECT \*, updated_at::text AS updated_at_version FROM pastor_letters/i.test(sql)) return letter ? [letter] : [];
    if (/UPDATE pastor_letters/i.test(sql)) return [{ ...letter, is_verified: params[1] }];
    if (/INSERT INTO admin_audit_logs/i.test(sql)) {
      if (auditError) throw auditError;
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('撤权管理员和自审都不能核验牧者介绍信', async () => {
  const revoked = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve', updated_at: LETTER_UPDATED_AT },
    dbRows: reviewDb({ actor: { id: ADMIN_ID, role: 'free', is_banned: false } }),
  });
  assert.equal(revoked.status, 403);
  assert.equal(revoked.calls.at(-1).sql, 'ROLLBACK');

  const self = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve', updated_at: LETTER_UPDATED_AT },
    dbRows: reviewDb({ letter: { id: LETTER_ID, user_id: ADMIN_ID, is_verified: false, updated_at: LETTER_UPDATED_AT, updated_at_version: LETTER_UPDATED_AT } }),
  });
  assert.equal(self.status, 403);
  assert.equal(self.calls.some(({ sql }) => /UPDATE pastor_letters/i.test(sql)), false);
});

test('核验介绍信会在同一事务内锁定、更新并写审计', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve', updated_at: LETTER_UPDATED_AT },
    dbRows: reviewDb(),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.letter.is_verified, true);
  assert.match(
    result.calls.find(({ sql }) => /updated_at::text AS updated_at_version FROM pastor_letters/i.test(sql)).sql,
    /updated_at::text AS updated_at_version/i
  );
  assert.deepEqual(result.calls.map(({ sql }) => {
    if (sql === 'BEGIN' || sql === 'COMMIT') return sql;
    if (/pg_advisory/i.test(sql)) return 'LOCK_ADMIN';
    if (/FROM users/i.test(sql)) return 'LOCK_ACTOR';
    if (/updated_at::text AS updated_at_version FROM pastor_letters/i.test(sql)) return 'LOCK_LETTER';
    if (/UPDATE pastor_letters/i.test(sql)) return 'UPDATE_LETTER';
    if (/INSERT INTO admin_audit_logs/i.test(sql)) return 'AUDIT';
    return sql;
  }), ['BEGIN', 'LOCK_ADMIN', 'LOCK_ACTOR', 'LOCK_LETTER', 'UPDATE_LETTER', 'AUDIT', 'COMMIT']);
});

test('核验接口拒绝非法参数且不存在的介绍信返回 404', async () => {
  const invalidId = await requestRoute({
    method: 'PATCH',
    path: '/pastor-letters/not-a-uuid',
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve', updated_at: LETTER_UPDATED_AT },
    dbRows: async () => { throw new Error('database should not be called'); },
  });
  assert.equal(invalidId.status, 400);
  assert.equal(invalidId.calls.length, 0);

  const invalidAction = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'invalid', updated_at: LETTER_UPDATED_AT },
    dbRows: async () => { throw new Error('database should not be called'); },
  });
  assert.equal(invalidAction.status, 400);
  assert.equal(invalidAction.calls.length, 0);

  const missing = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve', updated_at: LETTER_UPDATED_AT },
    dbRows: reviewDb({ letter: null }),
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(missing.calls.some(({ sql }) => /UPDATE pastor_letters|INSERT INTO admin_audit_logs/i.test(sql)), false);
});

test('核验接口要求内容版本并拒绝审核管理员未看过的新内容', async () => {
  const missingVersion = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve' },
    dbRows: async () => { throw new Error('database should not be called'); },
  });
  assert.equal(missingVersion.status, 400);
  assert.equal(missingVersion.calls.length, 0);

  const stale = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'approve', updated_at: '2026-07-14T00:00:00.000Z' },
    dbRows: reviewDb(),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(stale.calls.some(({ sql }) => /UPDATE pastor_letters|INSERT INTO admin_audit_logs/i.test(sql)), false);
});

test('撤销核验会清空核验人和时间，重复操作返回 409', async () => {
  const revoked = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'revoke', updated_at: LETTER_UPDATED_AT },
    dbRows: reviewDb({ letter: { id: LETTER_ID, user_id: USER_ID, is_verified: true, updated_at: LETTER_UPDATED_AT, updated_at_version: LETTER_UPDATED_AT } }),
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.letter.is_verified, false);
  const update = revoked.calls.find(({ sql }) => /UPDATE pastor_letters/i.test(sql));
  assert.deepEqual(update.params, [LETTER_ID, false, ADMIN_ID, LETTER_UPDATED_AT]);
  assert.match(update.sql, /verified_by = CASE WHEN \$2 THEN \$3::uuid ELSE NULL END/i);
  assert.match(update.sql, /verified_at = CASE WHEN \$2 THEN now\(\) ELSE NULL END/i);
  assert.match(update.sql, /updated_at = clock_timestamp\(\)/i);
  assert.match(update.sql, /updated_at = \$4::timestamptz/i);

  const duplicate = await requestRoute({
    method: 'PATCH',
    path: `/pastor-letters/${LETTER_ID}`,
    userId: ADMIN_ID,
    userRole: 'admin',
    body: { action: 'revoke', updated_at: LETTER_UPDATED_AT },
    dbRows: reviewDb({ letter: { id: LETTER_ID, user_id: USER_ID, is_verified: false, updated_at: LETTER_UPDATED_AT, updated_at_version: LETTER_UPDATED_AT } }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(duplicate.calls.some(({ sql }) => /UPDATE pastor_letters|INSERT INTO admin_audit_logs/i.test(sql)), false);
});

test('审计失败会回滚介绍信核验', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await requestRoute({
      method: 'PATCH',
      path: `/pastor-letters/${LETTER_ID}`,
      userId: ADMIN_ID,
      userRole: 'admin',
      body: { action: 'approve', updated_at: LETTER_UPDATED_AT },
      dbRows: reviewDb({ auditError: new Error('audit unavailable') }),
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(result.status, 500);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(result.calls.some(({ sql }) => sql === 'COMMIT'), false);
});

test('互有意向后只能读取已核验且不含联系方式的介绍信', async () => {
  const result = await requestRoute({
    path: `/match/${TARGET_ID}/pastor-letter`,
    dbRows: async (sql) => {
      if (/FROM matches a JOIN matches b/i.test(sql)) return [{ ok: 1 }];
      if (/FROM pastor_letters/i.test(sql)) {
        return [{
          pastor_name: '王牧师',
          pastor_contact: 'must-not-leak@example.com',
          family_note: '家庭情况',
          faith_note: '信仰情况',
          spiritual_note: '属灵生命',
          church_life_note: '教会生活',
          verified_at: '2026-07-15T00:00:00.000Z',
          verified_by: ADMIN_ID,
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.letter.pastor_name, '王牧师');
  assert.equal('pastor_contact' in result.body.letter, false);
  assert.deepEqual(Object.keys(result.body.letter).sort(), [
    'church_life_note',
    'faith_note',
    'family_note',
    'pastor_name',
    'spiritual_note',
    'verified_at',
  ]);
  assert.doesNotMatch(result.calls[1].sql, /pastor_contact/i);
  assert.match(result.calls[1].sql, /is_verified = TRUE/i);
});

test('没有互相意向时不能读取介绍信', async () => {
  const result = await requestRoute({
    path: `/match/${TARGET_ID}/pastor-letter`,
    dbRows: async (sql) => {
      if (/FROM matches a JOIN matches b/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.length, 1);
});

test('非法匹配对象 ID 被拒绝，未核验介绍信返回空值', async () => {
  const invalid = await requestRoute({
    path: '/match/not-a-uuid/pastor-letter',
    dbRows: async () => { throw new Error('database should not be called'); },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.calls.length, 0);

  const unverified = await requestRoute({
    path: `/match/${TARGET_ID}/pastor-letter`,
    dbRows: async (sql) => {
      if (/FROM matches a JOIN matches b/i.test(sql)) return [{ ok: 1 }];
      if (/FROM pastor_letters/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  assert.equal(unverified.status, 200);
  assert.equal(unverified.body.letter, null);
});
