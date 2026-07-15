import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import communityRoutes from './community.routes.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const POST_AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const ROOT_AUTHOR_ID = '33333333-3333-4333-8333-333333333333';
const POST_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_POST_ID = '55555555-5555-4555-8555-555555555555';
const ROOT_ID = '66666666-6666-4666-8666-666666666666';
const REPLY_ID = '77777777-7777-4777-8777-777777777777';
const GROUP_ID = '88888888-8888-4888-8888-888888888888';
const NOTIFICATION_ID = '99999999-9999-4999-8999-999999999999';

test.after(async () => {
  await pool.end();
});

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute({ method = 'GET', path, body, dbRows }) {
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
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function visiblePost(sql) {
  if (/FROM community_posts p/i.test(sql) && /p\.moderation = 'approved'/i.test(sql)) {
    return [{ id: POST_ID, author_id: POST_AUTHOR_ID, group_id: null }];
  }
  return null;
}

function assertRevocationBlockingLock(sql) {
  assert.match(sql, /FOR (?:SHARE|(?:NO KEY )?UPDATE)\b/i);
  assert.doesNotMatch(sql, /FOR KEY SHARE\b/i);
}

function assertNotificationVisibilityFilter(sql) {
  assert.match(sql, /notification_actor\.is_banned = FALSE/i);
  assert.match(sql, /n\.post_id IS NULL/i);
  assert.match(sql, /EXISTS \( SELECT 1 FROM community_posts p JOIN users post_author/i);
  assert.match(sql, /post_author\.is_banned = FALSE/i);
  assert.match(sql, /WHERE p\.id = n\.post_id/i);
  assert.match(sql, /p\.state IN \('visible','pinned','featured'\)/i);
  assert.match(sql, /p\.moderation = 'approved'/i);
  assert.match(sql, /p\.group_id IS NULL OR EXISTS \( SELECT 1 FROM community_memberships cm/i);
  assert.match(sql, /cm\.group_id = p\.group_id/i);
  assert.match(sql, /cm\.user_id = \$1/i);
  assert.match(sql, /cm\.state = 'approved'/i);
}

test('同帖根评论回复成功并通知被回复评论作者', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: `/community/posts/${POST_ID}/comments`,
    body: { body: '回复根评论', parent_id: ROOT_ID },
    dbRows: async (sql, params, transaction) => {
      const post = visiblePost(sql);
      if (post) return post;
      if (/SELECT id, post_id, author_id, parent_id FROM community_comments/i.test(sql)) {
        assert.equal(transaction, true);
        assert.match(sql, /FOR SHARE/i);
        return [{ id: ROOT_ID, post_id: POST_ID, author_id: ROOT_AUTHOR_ID, parent_id: null }];
      }
      if (/INSERT INTO community_comments/i.test(sql)) {
        assert.deepEqual(params, [POST_ID, USER_ID, ROOT_ID, '回复根评论']);
        return [{ id: REPLY_ID, created_at: '2026-07-15T00:00:00.000Z' }];
      }
      if (/INSERT INTO notifications/i.test(sql)) {
        assert.deepEqual(params, [ROOT_AUTHOR_ID, USER_ID, 'reply', POST_ID, REPLY_ID]);
        return [];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.id, REPLY_ID);
  assert.equal(result.calls.at(-1).sql, 'COMMIT');
});

test('跨帖父评论和回复的回复都会在插入前被拒绝', async () => {
  for (const parent of [
    { id: ROOT_ID, post_id: OTHER_POST_ID, author_id: ROOT_AUTHOR_ID, parent_id: null },
    { id: ROOT_ID, post_id: POST_ID, author_id: ROOT_AUTHOR_ID, parent_id: REPLY_ID },
  ]) {
    const result = await requestRoute({
      method: 'POST',
      path: `/community/posts/${POST_ID}/comments`,
      body: { body: '非法回复', parent_id: ROOT_ID },
      dbRows: async (sql) => {
        const post = visiblePost(sql);
        if (post) return post;
        if (/SELECT id, post_id, author_id, parent_id FROM community_comments/i.test(sql)) return [parent];
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    });

    assert.equal(result.status, 400);
    assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_comments/i.test(sql)), false);
    assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
  }
});

test('非法父评论 ID 在数据库查询前返回 400', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: `/community/posts/${POST_ID}/comments`,
    body: { body: '非法回复', parent_id: 'not-a-uuid' },
    dbRows: async (sql) => {
      const post = visiblePost(sql);
      if (post) return post;
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
});

test('评论列表返回一级 replies 和权威总数', async () => {
  const rows = [
    { id: ROOT_ID, post_id: POST_ID, author_id: ROOT_AUTHOR_ID, parent_id: null, body: '根评论' },
    { id: REPLY_ID, post_id: POST_ID, author_id: USER_ID, parent_id: ROOT_ID, body: '一级回复' },
  ];
  const result = await requestRoute({
    path: `/community/posts/${POST_ID}/comments`,
    dbRows: async (sql) => {
      const post = visiblePost(sql);
      if (post) return post;
      if (/FROM community_comments c/i.test(sql)) return rows;
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.total, 2);
  assert.equal(result.body.comments.length, 1);
  assert.equal(result.body.comments[0].replies.length, 1);
  assert.equal(result.body.comments[0].replies[0].id, REPLY_ID);
});

test('私密小组评论在同一事务锁定帖子和成员关系后重新校验撤权', async () => {
  let lockedPost = false;
  let lockedMembership = false;
  const result = await requestRoute({
    method: 'POST',
    path: `/community/posts/${POST_ID}/comments`,
    body: { body: '撤权后不可写入' },
    dbRows: async (sql, _params, transaction) => {
      if (/FROM community_posts p/i.test(sql) && /p\.moderation = 'approved'/i.test(sql)) {
        if (transaction) {
          assertRevocationBlockingLock(sql);
          lockedPost = true;
        }
        return [{ id: POST_ID, author_id: POST_AUTHOR_ID, group_id: GROUP_ID }];
      }
      if (/FROM community_memberships/i.test(sql)) {
        assert.equal(transaction, true);
        assertRevocationBlockingLock(sql);
        lockedMembership = true;
        return [];
      }
      if (/INSERT INTO community_comments/i.test(sql)) {
        return [{ id: REPLY_ID, created_at: '2026-07-15T00:00:00.000Z' }];
      }
      if (/INSERT INTO notifications/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  assert.equal(lockedPost, true);
  assert.equal(lockedMembership, true);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_comments/i.test(sql)), false);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
});

test('回复目标已失去私密小组可见性时不创建通知', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: `/community/posts/${POST_ID}/comments`,
    body: { body: '仅写评论，不通知已退出成员', parent_id: ROOT_ID },
    dbRows: async (sql, params, transaction) => {
      if (/FROM community_posts p/i.test(sql) && /p\.moderation = 'approved'/i.test(sql)) {
        if (transaction) assertRevocationBlockingLock(sql);
        return [{ id: POST_ID, author_id: POST_AUTHOR_ID, group_id: GROUP_ID }];
      }
      if (/SELECT id, post_id, author_id, parent_id FROM community_comments/i.test(sql)) {
        assert.equal(transaction, true);
        return [{ id: ROOT_ID, post_id: POST_ID, author_id: ROOT_AUTHOR_ID, parent_id: null }];
      }
      if (/FROM community_memberships/i.test(sql)) {
        assert.equal(transaction, true);
        assertRevocationBlockingLock(sql);
        assert.equal(params[0], GROUP_ID);
        assert.deepEqual([...params[1]].sort(), [USER_ID, ROOT_AUTHOR_ID].sort());
        return [{ user_id: USER_ID }];
      }
      if (/INSERT INTO community_comments/i.test(sql)) {
        return [{ id: REPLY_ID, created_at: '2026-07-15T00:00:00.000Z' }];
      }
      if (/INSERT INTO notifications/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  const insertIndex = result.calls.findIndex(({ sql }) => /INSERT INTO community_comments/i.test(sql));
  const lockedPostIndex = result.calls.findIndex(({ sql, transaction }) => (
    transaction && /FROM community_posts p/i.test(sql)
  ));
  const lockedMembershipIndex = result.calls.findIndex(({ sql }) => /FROM community_memberships/i.test(sql));
  assert.ok(lockedPostIndex > -1 && lockedPostIndex < insertIndex);
  assert.ok(lockedMembershipIndex > -1 && lockedMembershipIndex < insertIndex);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO notifications/i.test(sql)), false);
});

test('通知列表在分页前过滤当前不可见的小组帖子通知', async () => {
  const result = await requestRoute({
    path: '/community/notifications',
    dbRows: async (sql, params) => {
      if (/SELECT n\.id, n\.kind/i.test(sql)) {
        assertNotificationVisibilityFilter(sql);
        assert.deepEqual(params, [USER_ID, 20, 0]);
        assert.ok(sql.indexOf('community_memberships') < sql.indexOf('LIMIT $2'));
        return [{ id: NOTIFICATION_ID, kind: 'comment', post_id: POST_ID, is_read: false }];
      }
      if (/SELECT COUNT\(\*\)::int AS count FROM notifications/i.test(sql)) {
        assertNotificationVisibilityFilter(sql);
        assert.deepEqual(params, [USER_ID]);
        return [{ count: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.notifications.map(({ id }) => id), [NOTIFICATION_ID]);
  assert.equal(result.body.unread, 1);
});

test('未读通知计数排除当前不可见的小组帖子通知', async () => {
  const result = await requestRoute({
    path: '/community/notifications/unread',
    dbRows: async (sql, params) => {
      assert.match(sql, /SELECT COUNT\(\*\)::int AS count FROM notifications/i);
      assertNotificationVisibilityFilter(sql);
      assert.deepEqual(params, [USER_ID]);
      return [{ count: 2 }];
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.unread, 2);
});
