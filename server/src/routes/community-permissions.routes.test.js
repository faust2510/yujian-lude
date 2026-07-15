import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import { invalidateSettings } from '../settings.js';
import communityRoutes from './community.routes.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';
const POST_ID = '55555555-5555-4555-8555-555555555555';
const APPLICATION_ID = '66666666-6666-4666-8666-666666666666';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute({ method = 'GET', path, body, dbRows, userId = USER_ID, userRole = 'free' }) {
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
  invalidateSettings();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, role: userRole, is_banned: false };
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
    return {
      status: response.status,
      body: await response.json(),
      calls,
    };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    invalidateSettings();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function qualifiedUserRows(sql) {
  if (/SELECT key, value FROM app_settings/i.test(sql)) {
    return [
      { key: 'match.require_faith_test', value: false },
      { key: 'match.require_verified_pastor', value: false },
      { key: 'match.require_light_course', value: false },
    ];
  }
  if (/FROM profiles/i.test(sql)) return [{ completion: 100, privacy_ok: true }];
  if (/FROM faith_profiles/i.test(sql)) {
    return [{
      church_name: '恩典堂',
      presbytery: '华东区会',
      baptism_date: new Date('2020-01-01'),
      faith_years: 6,
      testimony: '稳定参与教会生活',
    }];
  }
  if (/FROM faith_tests/i.test(sql)) return [];
  if (/FROM endorsements/i.test(sql)) return [];
  return null;
}

test('组级获批申请不会授予全站删帖权限', async () => {
  const result = await requestRoute({
    method: 'DELETE',
    path: `/community/posts/${POST_ID}`,
    dbRows: async (sql) => {
      if (/SELECT author_id, group_id FROM community_posts/i.test(sql)) {
        return [{ author_id: OTHER_ID, group_id: null }];
      }
      if (/FROM community_admin_applications/i.test(sql)) {
        return /group_id IS NULL/i.test(sql) ? [] : [{ ok: 1 }];
      }
      if (/UPDATE community_posts/i.test(sql) || /INSERT INTO admin_audit_logs/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  const authorityCheck = result.calls.find(({ sql }) => /FROM community_admin_applications/i.test(sql));
  assert.match(authorityCheck.sql, /group_id IS NULL/i);
});

test('普通用户不能伪造全站公告', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/community/posts',
    body: { content: '伪造公告', post_type: 'announcement' },
    dbRows: async (sql) => {
      const qualification = qualifiedUserRows(sql);
      if (qualification) return qualification;
      if (/FROM community_admin_applications/i.test(sql)) return [];
      if (/INSERT INTO community_posts/i.test(sql)) return [{ id: POST_ID }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_posts/i.test(sql)), false);
});

test('小组公告仅允许组管理员发布并直接通过审核', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/community/posts',
    body: { group_id: GROUP_ID, content: '本周聚会通知', post_type: 'announcement' },
    dbRows: async (sql) => {
      const qualification = qualifiedUserRows(sql);
      if (qualification) return qualification;
      if (/SELECT role, state FROM community_memberships/i.test(sql)) {
        return [{ role: 'admin', state: 'approved' }];
      }
      if (/role IN \('owner','admin'\)/i.test(sql)) return [{ ok: 1 }];
      if (/INSERT INTO community_posts/i.test(sql)) return [{ id: POST_ID }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.moderation, 'approved');
  const insert = result.calls.find(({ sql }) => /INSERT INTO community_posts/i.test(sql));
  assert.equal(insert.params[2], 'announcement');
  assert.equal(insert.params[6], 'approved');
});

test('已完成全部准入项的关系用户仍可发布社区帖子', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/community/posts',
    body: { content: '关系建立后仍然参与社区。' },
    dbRows: async (sql) => {
      if (/SELECT key, value FROM app_settings/i.test(sql)) {
        return [
          { key: 'match.require_faith_test', value: false },
          { key: 'match.require_verified_pastor', value: false },
          { key: 'match.require_light_course', value: false },
        ];
      }
      if (/FROM relationships/i.test(sql)) return [{ ok: 1 }];
      if (/FROM profiles/i.test(sql)) {
        return [{ completion: 100, privacy_ok: true, birth_date: new Date('1990-01-01') }];
      }
      if (/FROM faith_profiles/i.test(sql)) {
        return [{
          church_name: '恩典堂',
          presbytery: '华东区会',
          region: '上海',
          denomination: '长老会',
          baptism_date: new Date('2020-01-01'),
          faith_years: 6,
          testimony: '稳定参与教会生活',
        }];
      }
      if (/FROM faith_tests/i.test(sql) || /FROM endorsements/i.test(sql)) return [];
      if (/INSERT INTO community_posts/i.test(sql)) return [{ id: POST_ID }];
      if (/INSERT INTO community_post_hashtags/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.id, POST_ID);
});

test('非小组成员不能申请组管理员', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/community/admin-apply',
    body: { group_id: GROUP_ID, reason: '希望参与服事' },
    dbRows: async (sql) => {
      if (/FROM community_memberships/i.test(sql)) return [];
      if (/INSERT INTO community_admin_applications/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_admin_applications/i.test(sql)), false);
});

test('非法的社区资源 ID 在查询数据库前统一返回 400', async () => {
  const invalidResourceRequests = [
    { path: '/community/groups/not-a-uuid' },
    { method: 'PATCH', path: '/community/groups/not-a-uuid', body: { name: '测试' } },
    { method: 'POST', path: '/community/groups/not-a-uuid/join', body: {} },
    { path: '/community/groups/not-a-uuid/members' },
    { path: '/community/groups/not-a-uuid/pending' },
    { method: 'PATCH', path: `/community/groups/not-a-uuid/members/${OTHER_ID}`, body: { action: 'approve' } },
    { method: 'PATCH', path: `/community/groups/${GROUP_ID}/members/not-a-uuid`, body: { action: 'approve' } },
    { method: 'POST', path: '/community/posts/not-a-uuid/like', body: {} },
    { path: '/community/posts/not-a-uuid/comments' },
    { method: 'DELETE', path: '/community/comments/not-a-uuid' },
    { method: 'POST', path: '/community/follow/not-a-uuid', body: {} },
    { method: 'DELETE', path: '/community/posts/not-a-uuid' },
    { method: 'PATCH', path: '/community/posts/not-a-uuid/feature', body: { action: 'pin' } },
    { method: 'PATCH', path: '/community/posts/not-a-uuid/moderate', body: { action: 'approve' } },
    { method: 'POST', path: '/community/posts/not-a-uuid/bookmark', body: {} },
    { path: '/community/groups/not-a-uuid/events' },
    { method: 'POST', path: '/community/groups/not-a-uuid/events', body: { title: '测试活动' } },
    { method: 'POST', path: '/community/events/not-a-uuid/rsvp', body: { status: 'going' } },
    { path: '/community/user/not-a-uuid/profile' },
    { path: '/community/user/not-a-uuid/posts' },
  ];
  for (const request of invalidResourceRequests) {
    const result = await requestRoute({
      ...request,
      dbRows: async (sql) => { throw new Error(`Unexpected SQL: ${sql}`); },
    });
    assert.equal(result.status, 400, `${request.method || 'GET'} ${request.path}`);
    assert.equal(result.calls.length, 0, `${request.method || 'GET'} ${request.path}`);
  }

  const invalidGroup = await requestRoute({
    method: 'POST',
    path: '/community/admin-apply',
    body: { group_id: 'not-a-uuid', reason: '测试' },
    dbRows: async (sql) => { throw new Error(`Unexpected SQL: ${sql}`); },
  });
  const invalidApplication = await requestRoute({
    method: 'PATCH',
    path: '/community/admin-applications/not-a-uuid',
    body: { action: 'approve' },
    userId: ADMIN_ID,
    userRole: 'admin',
    dbRows: async (sql) => { throw new Error(`Unexpected SQL: ${sql}`); },
  });

  assert.equal(invalidGroup.status, 400);
  assert.equal(invalidApplication.status, 400);
  assert.equal(invalidGroup.calls.length, 0);
  assert.equal(invalidApplication.calls.length, 0);
});

test('批准组级管理员申请会在同一事务中提升准确的 membership', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/community/admin-applications/${APPLICATION_ID}`,
    body: { action: 'approve' },
    userId: ADMIN_ID,
    userRole: 'admin',
    dbRows: async (sql, params, transaction) => {
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        assert.equal(transaction, true);
        assert.match(sql, /FOR UPDATE/i);
        return [{ id: ADMIN_ID, role: 'admin', is_banned: false }];
      }
      if (/UPDATE community_admin_applications/i.test(sql)) {
        assert.equal(transaction, true);
        return [{ id: APPLICATION_ID, user_id: USER_ID, group_id: GROUP_ID }];
      }
      if (/UPDATE community_memberships/i.test(sql)) {
        assert.equal(transaction, true);
        assert.deepEqual(params, [ADMIN_ID, USER_ID, GROUP_ID]);
        return [{ user_id: USER_ID, group_id: GROUP_ID, role: 'admin' }];
      }
      if (/INSERT INTO admin_audit_logs/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.calls.some(({ sql }) => /UPDATE community_memberships/i.test(sql)), true);
  assert.equal(result.calls.at(-1).sql, 'COMMIT');
});

test('事务内已撤权的管理员不能批准申请', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/community/admin-applications/${APPLICATION_ID}`,
    body: { action: 'approve' },
    userId: ADMIN_ID,
    userRole: 'admin',
    dbRows: async (sql) => {
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        return [{ id: ADMIN_ID, role: 'free', is_banned: false }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /UPDATE community_admin_applications/i.test(sql)), false);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
});

test('组 membership 已失效时批准申请会回滚且不写审计', async () => {
  const result = await requestRoute({
    method: 'PATCH',
    path: `/community/admin-applications/${APPLICATION_ID}`,
    body: { action: 'approve' },
    userId: ADMIN_ID,
    userRole: 'admin',
    dbRows: async (sql) => {
      if (/SELECT id, role, is_banned FROM users/i.test(sql)) {
        return [{ id: ADMIN_ID, role: 'admin', is_banned: false }];
      }
      if (/UPDATE community_admin_applications/i.test(sql)) {
        return [{ id: APPLICATION_ID, user_id: USER_ID, group_id: GROUP_ID }];
      }
      if (/UPDATE community_memberships/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(result.status, 409);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO admin_audit_logs/i.test(sql)), false);
  assert.equal(result.calls.at(-1).sql, 'ROLLBACK');
});

test('只有组长可以把已通过成员提升为管理员', async () => {
  const ownerResult = await requestRoute({
    method: 'PATCH',
    path: `/community/groups/${GROUP_ID}/members/${OTHER_ID}`,
    body: { action: 'promote' },
    dbRows: async (sql) => {
      if (/role = 'owner'/i.test(sql)) return [{ ok: 1 }];
      if (/UPDATE community_memberships/i.test(sql)) return [{ user_id: OTHER_ID, role: 'admin' }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  const adminResult = await requestRoute({
    method: 'PATCH',
    path: `/community/groups/${GROUP_ID}/members/${OTHER_ID}`,
    body: { action: 'promote' },
    dbRows: async (sql) => {
      if (/role = 'owner'/i.test(sql)) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });

  assert.equal(ownerResult.status, 200);
  assert.equal(adminResult.status, 403);
});
