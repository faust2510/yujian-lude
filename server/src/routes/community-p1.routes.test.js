import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import communityRoutes from './community.routes.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute({ method = 'GET', path, body, dbRows, userRole = 'admin' }) {
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
    req.user = { id: ADMIN_ID, role: userRole, is_banned: false };
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

test('平台管理员可以删除他人的全站帖子', async () => {
  const result = await requestRoute({
    method: 'DELETE',
    path: `/community/posts/${POST_ID}`,
    body: { reason: '举报处置' },
    dbRows: async (sql) => {
      if (/SELECT author_id, group_id FROM community_posts/i.test(sql)) {
        return [{ author_id: AUTHOR_ID, group_id: null }];
      }
      if (/FROM community_admin_applications/i.test(sql)) return [];
      if (/UPDATE community_posts|INSERT INTO admin_audit_logs/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.calls.some(({ sql }) => /UPDATE community_posts SET state = 'removed'/i.test(sql)), true);
});

test('平台管理员可以将帖子设为精选', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/community/posts/${POST_ID}/feature`,
    body: { action: 'feature' },
    dbRows: async (sql) => {
      if (/SELECT group_id, state FROM community_posts/i.test(sql)) return [{ group_id: null, state: 'visible' }];
      if (/FROM community_admin_applications/i.test(sql)) return [];
      if (/UPDATE community_posts SET state = 'featured'/i.test(sql)) return [{ id: POST_ID }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.calls.some(({ sql }) => /UPDATE community_posts SET state = 'featured'/i.test(sql)), true);
});

test('已删除帖子不能通过置顶或精选重新公开', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/community/posts/${POST_ID}/feature`,
    body: { action: 'pin' },
    dbRows: async (sql) => {
      if (/SELECT group_id, state FROM community_posts/i.test(sql)) {
        return [{ group_id: null, state: 'removed' }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 409);
  assert.equal(result.calls.some(({ sql }) => /UPDATE community_posts/i.test(sql)), false);
});

test('平台管理员可以审核小组帖子', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/community/posts/${POST_ID}/moderate`,
    body: { action: 'approve' },
    dbRows: async (sql) => {
      if (/SELECT author_id, group_id FROM community_posts/i.test(sql)) {
        return [{ author_id: AUTHOR_ID, group_id: GROUP_ID }];
      }
      if (/FROM community_memberships/i.test(sql)) return [];
      if (/UPDATE community_posts SET moderation/i.test(sql)) return [];
      if (/INSERT INTO notifications/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.calls.some(({ sql }) => /UPDATE community_posts SET moderation/i.test(sql)), true);
});

test('平台管理员无需加入小组即可查看待审核帖子', async () => {
  const result = await requestRoute({
    path: `/community/posts?group_id=${GROUP_ID}`,
    dbRows: async (sql) => {
      if (/FROM community_memberships\s+WHERE user_id/i.test(sql)) return [];
      if (/FROM community_posts p/i.test(sql)) {
        assert.match(sql, /p\.moderation IN \('approved','pending'\)/i);
        return [{ id: POST_ID, moderation: 'pending' }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.posts[0].moderation, 'pending');
});

async function assertFeedIncludesBookmark(path) {
  const result = await requestRoute({
    path,
    dbRows: async (sql) => {
      if (/FROM community_posts p/i.test(sql)) {
        const post = { id: POST_ID };
        if (/community_bookmarks[\s\S]+AS bookmarked_by_me/i.test(sql)) {
          post.bookmarked_by_me = true;
        }
        return [post];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.posts[0].bookmarked_by_me, true);
}

test('帖子搜索返回当前用户的收藏状态', async () => {
  await assertFeedIncludesBookmark('/community/posts/search?q=%E6%81%A9%E5%85%B8');
});

test('关注流返回当前用户的收藏状态', async () => {
  await assertFeedIncludesBookmark('/community/feed/following');
});
