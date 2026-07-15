import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_ID = '22222222-2222-4222-8222-222222222222';
const BANNED_ID = '33333333-3333-4333-8333-333333333333';
const ACTIVE_POST_ID = '44444444-4444-4444-8444-444444444444';
const BANNED_POST_ID = '55555555-5555-4555-8555-555555555555';
const ACTIVE_COMMENT_ID = '66666666-6666-4666-8666-666666666666';
const BANNED_COMMENT_ID = '77777777-7777-4777-8777-777777777777';
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function close(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('banned users and their community content are removed from public discovery', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `community_ban_visibility_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);
    const { pool } = await import('../db.js');
    const { default: communityRoutes } = await import('./community.routes.js');
    appPool = pool;

    await pool.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        is_banned BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        nickname TEXT,
        intro TEXT
      );
      CREATE TABLE community_posts (
        id UUID PRIMARY KEY,
        author_id UUID NOT NULL REFERENCES users(id),
        group_id UUID,
        title TEXT,
        body TEXT NOT NULL,
        image_url TEXT,
        post_type TEXT NOT NULL DEFAULT 'post',
        moderation TEXT NOT NULL DEFAULT 'approved',
        state TEXT NOT NULL DEFAULT 'visible',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE community_likes (post_id UUID NOT NULL, user_id UUID NOT NULL);
      CREATE TABLE community_comments (
        id UUID PRIMARY KEY,
        post_id UUID NOT NULL,
        author_id UUID NOT NULL,
        parent_id UUID,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE community_bookmarks (
        user_id UUID NOT NULL,
        post_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE community_follows (
        follower_id UUID NOT NULL,
        followee_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE community_hashtags (id UUID PRIMARY KEY, tag TEXT NOT NULL);
      CREATE TABLE community_post_hashtags (post_id UUID NOT NULL, hashtag_id UUID NOT NULL);
      CREATE TABLE community_groups (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        join_policy TEXT,
        cover_image TEXT,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE community_memberships (
        group_id UUID,
        user_id UUID,
        role TEXT,
        state TEXT,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      INSERT INTO users (id, is_banned) VALUES
        ('${VIEWER_ID}', FALSE), ('${ACTIVE_ID}', FALSE), ('${BANNED_ID}', TRUE);
      INSERT INTO profiles (user_id, nickname, intro) VALUES
        ('${ACTIVE_ID}', '正常用户', '正常介绍'), ('${BANNED_ID}', '封禁用户', '不应公开');
      INSERT INTO community_posts (id, author_id, title, body, created_at) VALUES
        ('${ACTIVE_POST_ID}', '${ACTIVE_ID}', '正常帖子', '正常帖子 可搜索', now()),
        ('${BANNED_POST_ID}', '${BANNED_ID}', '封禁帖子', '封禁帖子 可搜索', now() + interval '1 second');
      INSERT INTO community_comments (id, post_id, author_id, body) VALUES
        ('${ACTIVE_COMMENT_ID}', '${ACTIVE_POST_ID}', '${ACTIVE_ID}', '正常评论'),
        ('${BANNED_COMMENT_ID}', '${ACTIVE_POST_ID}', '${BANNED_ID}', '封禁评论');
      INSERT INTO community_follows (follower_id, followee_id) VALUES
        ('${VIEWER_ID}', '${ACTIVE_ID}'), ('${VIEWER_ID}', '${BANNED_ID}');
      INSERT INTO community_bookmarks (user_id, post_id) VALUES
        ('${VIEWER_ID}', '${ACTIVE_POST_ID}'), ('${VIEWER_ID}', '${BANNED_POST_ID}');
      INSERT INTO community_hashtags (id, tag) VALUES
        ('88888888-8888-4888-8888-888888888888', '正常标签'),
        ('99999999-9999-4999-8999-999999999999', '封禁标签');
      INSERT INTO community_post_hashtags (post_id, hashtag_id) VALUES
        ('${ACTIVE_POST_ID}', '88888888-8888-4888-8888-888888888888'),
        ('${BANNED_POST_ID}', '99999999-9999-4999-8999-999999999999');
      INSERT INTO community_groups (id, name, category, join_policy, created_by)
      VALUES ('${GROUP_ID}', '可见性小组', 'interest', 'open', '${ACTIVE_ID}');
      INSERT INTO community_memberships (group_id, user_id, role, state) VALUES
        ('${GROUP_ID}', '${ACTIVE_ID}', 'owner', 'approved'),
        ('${GROUP_ID}', '${BANNED_ID}', 'member', 'approved');
    `);

    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: VIEWER_ID, role: 'free', is_banned: false };
      next();
    });
    app.use(communityRoutes);
    app.use((error, _req, res, _next) => {
      res.status(error.status || 500).json({ error: error.message });
    });
    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const get = async (path) => {
      const response = await fetch(`${baseUrl}${path}`);
      return { status: response.status, body: await response.json() };
    };

    for (const path of [
      '/community/posts',
      '/community/posts/search?q=%E5%8F%AF%E6%90%9C%E7%B4%A2',
      '/community/feed/following',
      '/community/feed/hot',
      '/community/feed/trending',
      '/community/bookmarks',
    ]) {
      const result = await get(path);
      assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.body)}`);
      assert.deepEqual(result.body.posts.map(({ id }) => id), [ACTIVE_POST_ID], path);
    }

    const bannedProfile = await get(`/community/user/${BANNED_ID}/profile`);
    assert.equal(bannedProfile.status, 404);
    const bannedTimeline = await get(`/community/user/${BANNED_ID}/posts`);
    assert.equal(bannedTimeline.status, 200);
    assert.deepEqual(bannedTimeline.body.posts, []);

    const suggestions = await get('/community/suggested-users');
    assert.equal(suggestions.status, 200);
    assert.equal(suggestions.body.users.some(({ id }) => id === BANNED_ID), false);
    const following = await get('/community/following');
    assert.deepEqual(following.body.following.map(({ user_id }) => user_id), [ACTIVE_ID]);
    const hashtags = await get('/community/hashtags');
    assert.deepEqual(hashtags.body.hashtags.map(({ tag }) => tag), ['正常标签']);

    const groups = await get('/community/groups');
    assert.equal(groups.status, 200);
    assert.equal(groups.body.groups.find(({ id }) => id === GROUP_ID)?.member_count, 1);
    const members = await get(`/community/groups/${GROUP_ID}/members`);
    assert.equal(members.status, 200);
    assert.deepEqual(members.body.members.map(({ user_id }) => user_id), [ACTIVE_ID]);

    const comments = await get(`/community/posts/${ACTIVE_POST_ID}/comments`);
    assert.equal(comments.status, 200);
    assert.deepEqual(comments.body.comments.map(({ id }) => id), [ACTIVE_COMMENT_ID]);
    const bannedPostComments = await get(`/community/posts/${BANNED_POST_ID}/comments`);
    assert.equal(bannedPostComments.status, 403);
  } finally {
    await close(server);
    if (appPool) await appPool.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
