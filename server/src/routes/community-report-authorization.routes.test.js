import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import communityRoutes from './community.routes.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const COMMENT_ID = '44444444-4444-4444-8444-444444444444';
const GROUP_ID = '55555555-5555-4555-8555-555555555555';

test.after(async () => {
  await pool.end();
});

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestReport(body, dbRows) {
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
    req.user = { id: USER_ID, role: 'free', is_banned: false };
    next();
  });
  app.use(communityRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/community/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function assertRevocationBlockingLock(sql) {
  assert.match(sql, /FOR (?:SHARE|(?:NO KEY )?UPDATE)\b/i);
  assert.doesNotMatch(sql, /FOR KEY SHARE\b/i);
}

test('举报在查询数据库前拒绝非法类型、目标 ID 和原因', async () => {
  const invalidBodies = [
    { target_type: 'event', target_id: POST_ID, reason: 'spam' },
    { target_type: 'post', target_id: 'not-a-uuid', reason: 'spam' },
    { target_type: 'post', target_id: POST_ID, reason: 'not-supported' },
  ];

  for (const body of invalidBodies) {
    const result = await requestReport(body, async (sql) => {
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
});

test('用户不能举报自己', async () => {
  const result = await requestReport(
    { target_type: 'user', target_id: USER_ID, reason: 'harassment' },
    async (sql) => { throw new Error(`Unexpected SQL: ${sql}`); }
  );

  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
});

test('不可见或不存在的帖子不能被举报', async () => {
  const result = await requestReport(
    { target_type: 'post', target_id: POST_ID, reason: 'spam' },
    async (sql) => {
      if (/FROM community_posts p/i.test(sql)) return [];
      if (/INSERT INTO community_reports/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  );

  assert.equal(result.status, 404);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_reports/i.test(sql)), false);
});

test('评论举报沿所属帖子校验当前用户的小组可见性', async () => {
  const result = await requestReport(
    { target_type: 'comment', target_id: COMMENT_ID, reason: 'inappropriate' },
    async (sql) => {
      if (/FROM community_comments c/i.test(sql)) {
        assert.match(sql, /JOIN community_posts p ON p\.id = c\.post_id/i);
        assert.match(sql, /community_memberships/i);
        assert.match(sql, /cm\.user_id = \$2/i);
        return [];
      }
      if (/INSERT INTO community_reports/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  );

  assert.equal(result.status, 404);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_reports/i.test(sql)), false);
});

test('私密小组帖子举报在同一事务锁定目标和成员资格后才写入', async () => {
  const result = await requestReport(
    { target_type: 'post', target_id: POST_ID, reason: 'spam' },
    async (sql) => {
      if (/FROM community_posts p/i.test(sql)) {
        return [{ id: POST_ID, author_id: OTHER_ID, group_id: GROUP_ID }];
      }
      if (/FROM community_memberships/i.test(sql)) return [{ user_id: USER_ID }];
      if (/INSERT INTO community_reports/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  );

  assert.equal(result.status, 200);
  const postIndex = result.calls.findIndex(({ sql, transaction }) => (
    transaction && /FROM community_posts p/i.test(sql)
  ));
  const membershipIndex = result.calls.findIndex(({ sql, transaction }) => (
    transaction && /SELECT user_id FROM community_memberships/i.test(sql)
  ));
  const insertIndex = result.calls.findIndex(({ sql, transaction }) => (
    transaction && /INSERT INTO community_reports/i.test(sql)
  ));
  assert.ok(postIndex > 0, '帖子可见性必须在事务内重新校验');
  assert.ok(membershipIndex > postIndex, '成员资格必须在事务内重新校验');
  assert.ok(insertIndex > membershipIndex, '举报必须在锁定并重验可见性后写入');
  assertRevocationBlockingLock(result.calls[postIndex].sql);
  assertRevocationBlockingLock(result.calls[membershipIndex].sql);
  assert.equal(result.calls[0].sql, 'BEGIN');
  assert.equal(result.calls.at(-1).sql, 'COMMIT');
  assert.equal(result.calls.some(({ sql, transaction }) => (
    !transaction && /FROM community_posts p|FROM community_memberships|INSERT INTO community_reports/i.test(sql)
  )), false);
});

test('事务内重验到私密小组成员已撤权时拒绝举报', async () => {
  const result = await requestReport(
    { target_type: 'post', target_id: POST_ID, reason: 'harassment' },
    async (sql, _params, transaction) => {
      if (/FROM community_posts p/i.test(sql)) {
        if (transaction) assertRevocationBlockingLock(sql);
        return [{ id: POST_ID, author_id: OTHER_ID, group_id: GROUP_ID }];
      }
      if (/FROM community_memberships/i.test(sql)) {
        assert.equal(transaction, true);
        assertRevocationBlockingLock(sql);
        return [];
      }
      if (/INSERT INTO community_reports/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  );

  assert.equal(result.status, 404);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_reports/i.test(sql)), false);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
});

test('存在且可见的对象通过校验后才创建举报', async () => {
  const result = await requestReport(
    { target_type: 'user', target_id: OTHER_ID, reason: 'fraud', detail: '疑似虚假身份' },
    async (sql, params) => {
      if (/SELECT id FROM users/i.test(sql)) return [{ id: OTHER_ID }];
      if (/INSERT INTO community_reports/i.test(sql)) {
        assert.deepEqual(params, [USER_ID, 'user', OTHER_ID, 'fraud', '疑似虚假身份']);
        return [];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});
