import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { isInMatchPool } from '../lib/match-gate.js';

const router = Router();

// ── 权限辅助 ──────────────────────────────────────────────

async function isCommunityAdmin(userId) {
  const row = await one(
    `SELECT 1 FROM community_admin_applications WHERE user_id = $1 AND state = 'approved' LIMIT 1`,
    [userId]
  );
  return !!row;
}

async function isGroupAdmin(userId, groupId) {
  const row = await one(
    `SELECT 1 FROM community_memberships
     WHERE user_id = $1 AND group_id = $2 AND role IN ('owner','admin') AND state = 'approved' LIMIT 1`,
    [userId, groupId]
  );
  return !!row;
}

async function isGroupOwner(userId, groupId) {
  const row = await one(
    `SELECT 1 FROM community_memberships
     WHERE user_id = $1 AND group_id = $2 AND role = 'owner' AND state = 'approved' LIMIT 1`,
    [userId, groupId]
  );
  return !!row;
}

async function getMembership(userId, groupId) {
  return one(
    `SELECT role, state FROM community_memberships WHERE user_id = $1 AND group_id = $2`,
    [userId, groupId]
  );
}

async function canPost(userId) {
  return isInMatchPool(userId);
}

function extractHashtags(body) {
  const tags = body.match(/#([\u4e00-\u9fff\w-]+)/g);
  if (!tags) return [];
  return [...new Set(tags.map(t => t.slice(1).toLowerCase()))];
}

async function ensureHashtags(client, tagNames) {
  const ids = [];
  for (const tag of tagNames) {
    const row = await client.query(
      `INSERT INTO community_hashtags (tag) VALUES ($1)
       ON CONFLICT (tag) DO UPDATE SET tag = EXCLUDED.tag
       RETURNING id`,
      [tag]
    );
    ids.push(row.rows[0].id);
  }
  return ids;
}

// ── 小组 CRUD ─────────────────────────────────────────────

// GET /community/groups — 小组发现（分类筛选 + 搜索 + 成员数）
router.get('/community/groups', requireAuth, async (req, res) => {
  const { category, q } = req.query;
  const userId = req.user.id;
  const params = [userId];
  let where = '';
  if (category && category !== 'all') {
    params.push(category);
    where += ` AND g.category = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    where += ` AND g.name ILIKE $${params.length}`;
  }
  const { rows } = await query(
    `SELECT g.id, g.name, g.description, g.category, g.join_policy, g.cover_image,
            g.created_by, g.created_at,
            (SELECT COUNT(*)::int FROM community_memberships WHERE group_id = g.id AND state = 'approved') AS member_count,
            (SELECT role FROM community_memberships WHERE group_id = g.id AND user_id = $1 AND state = 'approved') AS my_role,
            (SELECT state FROM community_memberships WHERE group_id = g.id AND user_id = $1) AS my_membership_state
       FROM community_groups g
      WHERE 1=1 ${where}
      ORDER BY member_count DESC, g.created_at DESC`,
    params
  );
  res.json({ groups: rows });
});

// POST /community/groups — 创建小组（自动成为 owner）
router.post('/community/groups', requireAuth, async (req, res) => {
  const { name, description, category = 'interest', join_policy = 'apply', cover_image } = req.body;
  if (!name) return res.status(400).json({ error: '缺少 name' });
  const result = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO community_groups (name, description, category, join_policy, cover_image, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, description || null, category, join_policy, cover_image || null, req.user.id]
    );
    const groupId = rows[0].id;
    await client.query(
      `INSERT INTO community_memberships (user_id, group_id, role, state, approved_by)
       VALUES ($1, $2, 'owner', 'approved', $1)`,
      [req.user.id, groupId]
    );
    return groupId;
  });
  res.json({ ok: true, id: result });
});

// GET /community/groups/:id — 小组详情
router.get('/community/groups/:id', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;
  const row = await one(
    `SELECT g.id, g.name, g.description, g.category, g.join_policy, g.cover_image,
            g.created_by, g.created_at,
            (SELECT COUNT(*)::int FROM community_memberships WHERE group_id = g.id AND state = 'approved') AS member_count,
            (SELECT role FROM community_memberships WHERE group_id = g.id AND user_id = $2 AND state = 'approved') AS my_role,
            (SELECT state FROM community_memberships WHERE group_id = g.id AND user_id = $2) AS my_membership_state,
            COALESCE(pr.nickname, '匿名') AS owner_nickname
       FROM community_groups g
       LEFT JOIN profiles pr ON pr.user_id = g.created_by
      WHERE g.id = $1`,
    [groupId, userId]
  );
  if (!row) return res.status(404).json({ error: '小组不存在' });
  res.json({ group: row });
});

// PATCH /community/groups/:id — 编辑小组（owner/admin）
router.patch('/community/groups/:id', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  if (!(await isGroupAdmin(req.user.id, groupId))) {
    return res.status(403).json({ error: '仅组长可编辑' });
  }
  const { name, description, cover_image } = req.body;
  const sets = [];
  const params = [];
  if (name) { params.push(name); sets.push(`name = $${params.length}`); }
  if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
  if (cover_image !== undefined) { params.push(cover_image); sets.push(`cover_image = $${params.length}`); }
  if (sets.length === 0) return res.status(400).json({ error: '无更新字段' });
  params.push(groupId);
  await query(`UPDATE community_groups SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  res.json({ ok: true });
});

// ── 小组成员管理 ───────────────────────────────────────────

// POST /community/groups/:id/join — 加入/申请加入小组
router.post('/community/groups/:id/join', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;
  const group = await one(`SELECT join_policy FROM community_groups WHERE id = $1`, [groupId]);
  if (!group) return res.status(404).json({ error: '小组不存在' });
  const existing = await getMembership(userId, groupId);
  if (existing && existing.state === 'approved') {
    return res.status(409).json({ error: '已是成员' });
  }
  if (existing && existing.state === 'pending') {
    return res.status(409).json({ error: '已提交申请，等待审批' });
  }
  if (existing && existing.state === 'kicked') {
    return res.status(403).json({ error: '已被移出小组' });
  }
  const autoApprove = group.join_policy === 'open';
  if (existing) {
    await query(
      `UPDATE community_memberships SET state = $1 WHERE user_id = $2 AND group_id = $3`,
      [autoApprove ? 'approved' : 'pending', userId, groupId]
    );
  } else {
    await query(
      `INSERT INTO community_memberships (user_id, group_id, role, state)
       VALUES ($1, $2, 'member', $3)`,
      [userId, groupId, autoApprove ? 'approved' : 'pending']
    );
  }
  if (!autoApprove) {
    const owner = await one(
      `SELECT user_id FROM community_memberships WHERE group_id = $1 AND role = 'owner' AND state = 'approved'`,
      [groupId]
    );
    if (owner) {
      await query(
        `INSERT INTO notifications (user_id, actor_id, kind) VALUES ($1, $2, 'group_join')`,
        [owner.user_id, userId]
      );
    }
  }
  res.json({ ok: true, state: autoApprove ? 'approved' : 'pending' });
});

// GET /community/groups/:id/members — 成员列表
router.get('/community/groups/:id/members', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const { rows } = await query(
    `SELECT m.user_id, m.role, m.state, m.joined_at,
            COALESCE(pr.nickname, '匿名') AS nickname
       FROM community_memberships m
       LEFT JOIN profiles pr ON pr.user_id = m.user_id
      WHERE m.group_id = $1 AND m.state = 'approved'
      ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC, m.joined_at ASC`,
    [groupId]
  );
  res.json({ members: rows });
});

// GET /community/groups/:id/pending — 待审批成员（组长/管理员）
router.get('/community/groups/:id/pending', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  if (!(await isGroupAdmin(req.user.id, groupId))) {
    return res.status(403).json({ error: '仅组长可查看' });
  }
  const { rows } = await query(
    `SELECT m.user_id, m.joined_at, COALESCE(pr.nickname, '匿名') AS nickname
       FROM community_memberships m
       LEFT JOIN profiles pr ON pr.user_id = m.user_id
      WHERE m.group_id = $1 AND m.state = 'pending'
      ORDER BY m.joined_at ASC`,
    [groupId]
  );
  res.json({ pending: rows });
});

// PATCH /community/groups/:id/members/:userId — 审批/踢人（组长/管理员）
router.patch('/community/groups/:id/members/:userId', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const targetId = req.params.userId;
  const { action } = req.body; // 'approve' | 'reject' | 'kick'
  if (!['approve', 'reject', 'kick'].includes(action)) {
    return res.status(400).json({ error: 'action 须为 approve/reject/kick' });
  }
  if (!(await isGroupAdmin(req.user.id, groupId))) {
    return res.status(403).json({ error: '仅组长可操作' });
  }
  if (await isGroupOwner(targetId, groupId)) {
    return res.status(403).json({ error: '不能操作组长' });
  }
  const newState = action === 'approve' ? 'approved' : action === 'kick' ? 'kicked' : 'rejected';
  await query(
    `UPDATE community_memberships SET state = $1, approved_by = $2 WHERE user_id = $3 AND group_id = $4`,
    [newState, req.user.id, targetId, groupId]
  );
  res.json({ ok: true });
});

// ── 帖子搜索（需在 /community/posts/:id 之前）─────────────
router.get('/community/posts/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: '缺少搜索关键词' });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.body AS content, p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me
       FROM community_posts p
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
      WHERE p.state IN ('visible','pinned')
        AND p.body ILIKE '%' || $2 || '%'
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4`,
    [userId, q, limit, offset]
  );
  res.json({ posts: rows, page, query: q });
});

// --- 帖子列表（全站 / 按标签 / 按小组） ---
router.get('/community/posts', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const params = [];
  let where = `WHERE p.state IN ('visible','pinned') AND p.moderation = 'approved'`;

  if (req.query.group_id) {
    params.push(req.query.group_id);
    where += ` AND p.group_id = $${params.length}`;
  } else {
    where += ` AND p.group_id IS NULL`; // 全站广场
  }
  if (req.query.tag) {
    params.push(req.query.tag.toLowerCase());
    where += ` AND p.id IN (SELECT cph.post_id FROM community_post_hashtags cph
               JOIN community_hashtags ch ON ch.id = cph.hashtag_id WHERE ch.tag = $${params.length})`;
  }
  if (req.query.post_type) {
    params.push(req.query.post_type);
    where += ` AND p.post_type = $${params.length}`;
  }

  params.push(limit, offset);
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.title, p.body AS content, p.image_url, p.post_type,
            p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $${params.length + 1}) AS liked_by_me,
            EXISTS(SELECT 1 FROM community_bookmarks WHERE post_id = p.id AND user_id = $${params.length + 1}) AS bookmarked_by_me
       FROM community_posts p
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
       ${where}
      ORDER BY (p.state = 'pinned') DESC, (p.state = 'featured') DESC, p.created_at DESC
      LIMIT $${params.length} OFFSET $${params.length - 1}`,
    [...params, userId]
  );
  res.json({ posts: rows, page });
});

// 关注者 feed
router.get('/community/feed/following', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.body AS content, p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me
       FROM community_posts p
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
       WHERE p.state IN ('visible','pinned')
         AND p.author_id IN (SELECT followee_id FROM community_follows WHERE follower_id = $1)
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  res.json({ posts: rows, page });
});

// 热门（近 7 天按点赞数排序）
router.get('/community/feed/hot', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.title, p.body AS content, p.image_url, p.post_type,
            p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me,
            EXISTS(SELECT 1 FROM community_bookmarks WHERE post_id = p.id AND user_id = $1) AS bookmarked_by_me
       FROM community_posts p
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
       WHERE p.state IN ('visible','pinned') AND p.moderation = 'approved'
         AND p.created_at > now() - INTERVAL '7 days'
      ORDER BY like_count DESC, p.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  res.json({ posts: rows, page });
});

// 推荐流（综合热门 + 小组精华 + 全站）
router.get('/community/feed/trending', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.title, p.body AS content, p.image_url, p.post_type,
            p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me,
            EXISTS(SELECT 1 FROM community_bookmarks WHERE post_id = p.id AND user_id = $1) AS bookmarked_by_me
       FROM community_posts p
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
       WHERE p.state IN ('visible','pinned','featured') AND p.moderation = 'approved'
      ORDER BY (p.state = 'featured') DESC,
               (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id) DESC,
               p.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  res.json({ posts: rows, page });
});

// --- 发布帖子（支持图文、类型、审核） ---
router.post('/community/posts', requireAuth, async (req, res) => {
  const { group_id, content, title, image_url, post_type = 'post' } = req.body;
  if (!content) return res.status(400).json({ error: '缺少 content' });
  if (!(await canPost(req.user.id))) {
    return res.status(403).json({ error: '需完成资料、信仰测试、背书审核与恋爱必修课后方可发帖' });
  }
  // 小组内发帖需检查成员身份
  if (group_id) {
    const mem = await getMembership(req.user.id, group_id);
    if (!mem || mem.state !== 'approved') {
      return res.status(403).json({ error: '需先加入小组才能发帖' });
    }
  }
  // 先发后审：小组帖子默认 pending
  const moderation = group_id ? 'pending' : 'approved';

  const hashtags = extractHashtags(content);
  const post = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO community_posts (author_id, group_id, post_type, title, body, image_url, state, moderation)
       VALUES ($1, $2, $3, $4, $5, $6, 'visible', $7) RETURNING id`,
      [req.user.id, group_id ?? null, post_type, title || null, content, image_url || null, moderation]
    );
    const postId = rows[0].id;
    if (hashtags.length > 0) {
      const tagIds = await ensureHashtags(client, hashtags);
      for (const tid of tagIds) {
        await client.query(
          `INSERT INTO community_post_hashtags (post_id, hashtag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [postId, tid]
        );
      }
    }
    return postId;
  });
  res.json({ ok: true, id: post, moderation });
});

// --- 点赞/取消点赞 ---
router.post('/community/posts/:id/like', requireAuth, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const existing = await one(
    `SELECT 1 FROM community_likes WHERE user_id = $1 AND post_id = $2`,
    [userId, postId]
  );
  if (existing) {
    await query(`DELETE FROM community_likes WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
    res.json({ liked: false });
  } else {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO community_likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, postId]
      );
      const post = await client.query(`SELECT author_id FROM community_posts WHERE id = $1`, [postId]);
      if (post.rows.length > 0 && post.rows[0].author_id !== userId) {
        await client.query(
          `INSERT INTO notifications (user_id, actor_id, kind, post_id)
           VALUES ($1, $2, 'like', $3)`,
          [post.rows[0].author_id, userId, postId]
        );
      }
    });
    res.json({ liked: true });
  }
});

// --- 评论 ---
router.get('/community/posts/:id/comments', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.post_id, c.author_id, c.parent_id, c.body, c.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname
       FROM community_comments c
       LEFT JOIN profiles pr ON pr.user_id = c.author_id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  // Build nested tree
  const roots = rows.filter(c => !c.parent_id);
  const children = rows.filter(c => c.parent_id);
  const attachReplies = (comment) => {
    comment.replies = children.filter(c => c.parent_id === comment.id).map(r => {
      r.replies = [];
      return r;
    });
    return comment;
  };
  res.json({ comments: roots.map(attachReplies) });
});

router.post('/community/posts/:id/comments', requireAuth, async (req, res) => {
  const { body, parent_id } = req.body;
  if (!body) return res.status(400).json({ error: '缺少 body' });
  const postId = req.params.id;

  const comment = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO community_comments (post_id, author_id, parent_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [postId, req.user.id, parent_id ?? null, body]
    );
    const c = rows[0];
    // Notify post author
    const post = await client.query(`SELECT author_id FROM community_posts WHERE id = $1`, [postId]);
    const kind = parent_id ? 'reply' : 'comment';
    if (post.rows.length > 0 && post.rows[0].author_id !== req.user.id) {
      await client.query(
        `INSERT INTO notifications (user_id, actor_id, kind, post_id, comment_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [post.rows[0].author_id, req.user.id, kind, postId, c.id]
      );
    }
    return c;
  });
  res.json({ ok: true, id: comment.id, created_at: comment.created_at });
});

router.delete('/community/comments/:id', requireAuth, async (req, res) => {
  const row = await one(
    `SELECT author_id FROM community_comments WHERE id = $1`,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: '评论不存在' });
  if (row.author_id !== req.user.id) return res.status(403).json({ error: '无权删除' });
  await query(`DELETE FROM community_comments WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// --- 关注/取消关注 ---
router.post('/community/follow/:userId', requireAuth, async (req, res) => {
  const followeeId = req.params.userId;
  if (followeeId === req.user.id) return res.status(400).json({ error: '不能关注自己' });
  const existing = await one(
    `SELECT 1 FROM community_follows WHERE follower_id = $1 AND followee_id = $2`,
    [req.user.id, followeeId]
  );
  if (existing) {
    await query(
      `DELETE FROM community_follows WHERE follower_id = $1 AND followee_id = $2`,
      [req.user.id, followeeId]
    );
    res.json({ following: false });
  } else {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO community_follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.user.id, followeeId]
      );
      await client.query(
        `INSERT INTO notifications (user_id, actor_id, kind)
         VALUES ($1, $2, 'follow')`,
        [followeeId, req.user.id]
      );
    });
    res.json({ following: true });
  }
});

router.get('/community/following', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT f.followee_id AS user_id, COALESCE(pr.nickname, '匿名') AS nickname
       FROM community_follows f
       LEFT JOIN profiles pr ON pr.user_id = f.followee_id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json({ following: rows });
});

// --- 话题标签 ---
router.get('/community/hashtags', requireAuth, async (_req, res) => {
  const { rows } = await query(
    `SELECT ch.id, ch.tag, COUNT(cph.post_id) AS post_count
       FROM community_hashtags ch
       JOIN community_post_hashtags cph ON cph.hashtag_id = ch.id
       JOIN community_posts p ON p.id = cph.post_id
      WHERE p.state IN ('visible','pinned')
      GROUP BY ch.id, ch.tag
      ORDER BY post_count DESC
      LIMIT 20`
  );
  res.json({ hashtags: rows });
});

// --- 通知 ---
router.get('/community/notifications', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT n.id, n.kind, n.post_id, n.comment_id, n.is_read, n.created_at,
            COALESCE(pr.nickname, '匿名') AS actor_nickname
       FROM notifications n
       LEFT JOIN profiles pr ON pr.user_id = n.actor_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  const unread = await one(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );
  res.json({ notifications: rows, unread: unread.count });
});

router.post('/community/notifications/read', requireAuth, async (req, res) => {
  await query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );
  res.json({ ok: true });
});

router.get('/community/notifications/unread', requireAuth, async (req, res) => {
  const row = await one(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );
  res.json({ unread: row.count });
});

// --- 删除帖子（作者 / 组长 / 社区管理员） ---
router.delete('/community/posts/:id', requireAuth, async (req, res) => {
  const post = await one(`SELECT author_id, group_id FROM community_posts WHERE id = $1`, [req.params.id]);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const isAuthor = post.author_id === req.user.id;
  const isGroupMod = post.group_id && await isGroupAdmin(req.user.id, post.group_id);
  const isGlobalAdmin = await isCommunityAdmin(req.user.id);
  if (!isAuthor && !isGroupMod && !isGlobalAdmin) {
    return res.status(403).json({ error: '无权删除' });
  }
  const reason = req.body?.reason || null;
  await query(
    `UPDATE community_posts SET state = 'removed', removed_by = $1, removed_reason = $2 WHERE id = $3`,
    [req.user.id, reason, req.params.id]
  );
  res.json({ ok: true });
});

// --- 置顶/精华帖（组长 / 社区管理员） ---
router.patch('/community/posts/:id/feature', requireAuth, async (req, res) => {
  const { action } = req.body; // 'pin' | 'unpin' | 'feature' | 'unfeature'
  const post = await one(`SELECT group_id FROM community_posts WHERE id = $1`, [req.params.id]);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const isGroupMod = post.group_id && await isGroupAdmin(req.user.id, post.group_id);
  const isGlobalAdmin = await isCommunityAdmin(req.user.id);
  if (!isGroupMod && !isGlobalAdmin) return res.status(403).json({ error: '无权操作' });

  if (action === 'pin') {
    await query(`UPDATE community_posts SET state = 'pinned', pinned_by = $1 WHERE id = $2`, [req.user.id, req.params.id]);
  } else if (action === 'unpin') {
    await query(`UPDATE community_posts SET state = 'visible', pinned_by = NULL WHERE id = $1`, [req.params.id]);
  } else if (action === 'feature') {
    await query(`UPDATE community_posts SET state = 'featured', featured_by = $1 WHERE id = $2`, [req.user.id, req.params.id]);
  } else if (action === 'unfeature') {
    await query(`UPDATE community_posts SET state = 'visible', featured_by = NULL WHERE id = $1`, [req.params.id]);
  } else {
    return res.status(400).json({ error: 'action 须为 pin/unpin/feature/unfeature' });
  }
  res.json({ ok: true });
});

// --- 审核小组帖子（组长） ---
router.patch('/community/posts/:id/moderate', requireAuth, async (req, res) => {
  const { action } = req.body; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action 须为 approve 或 reject' });
  }
  const post = await one(`SELECT author_id, group_id FROM community_posts WHERE id = $1`, [req.params.id]);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (!post.group_id) return res.status(400).json({ error: '全站帖子无需审核' });
  if (!(await isGroupAdmin(req.user.id, post.group_id))) {
    return res.status(403).json({ error: '仅组长可审核' });
  }
  const newMod = action === 'approve' ? 'approved' : 'rejected';
  await query(`UPDATE community_posts SET moderation = $1 WHERE id = $2`, [newMod, req.params.id]);
  if (action === 'approve') {
    await query(
      `INSERT INTO notifications (user_id, actor_id, kind, post_id) VALUES ($1, $2, 'post_approved', $3)`,
      [post.author_id, req.user.id, req.params.id]
    );
  }
  res.json({ ok: true });
});

// ── 收藏 ──────────────────────────────────────────────────

// POST /community/posts/:id/bookmark — 收藏/取消收藏
router.post('/community/posts/:id/bookmark', requireAuth, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const existing = await one(
    `SELECT 1 FROM community_bookmarks WHERE user_id = $1 AND post_id = $2`,
    [userId, postId]
  );
  if (existing) {
    await query(`DELETE FROM community_bookmarks WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
    res.json({ bookmarked: false });
  } else {
    await query(
      `INSERT INTO community_bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, postId]
    );
    res.json({ bookmarked: true });
  }
});

// GET /community/bookmarks — 我的收藏
router.get('/community/bookmarks', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.title, p.body AS content, p.image_url, p.post_type,
            p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me,
            TRUE AS bookmarked_by_me
       FROM community_bookmarks b
       JOIN community_posts p ON p.id = b.post_id
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
      WHERE b.user_id = $1 AND p.state IN ('visible','pinned','featured')
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  res.json({ posts: rows, page });
});

// ── 举报 ──────────────────────────────────────────────────

// POST /community/reports — 提交举报
router.post('/community/reports', requireAuth, async (req, res) => {
  const { target_type, target_id, reason, detail } = req.body;
  if (!target_type || !target_id || !reason) {
    return res.status(400).json({ error: '缺少 target_type / target_id / reason' });
  }
  try {
    await query(
      `INSERT INTO community_reports (reporter_id, target_type, target_id, reason, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, target_type, target_id, reason, detail || null]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ error: '举报对象不存在' });
    throw e;
  }
});

// GET /community/reports — 管理员查看举报列表
router.get('/community/reports', requireAuth, requireRole('admin'), async (req, res) => {
  const state = req.query.state || 'pending';
  const { rows } = await query(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.state, r.created_at,
            COALESCE(pr.nickname, '匿名') AS reporter_nickname
       FROM community_reports r
       LEFT JOIN profiles pr ON pr.user_id = r.reporter_id
      WHERE r.state = $1
      ORDER BY r.created_at DESC
      LIMIT 50`,
    [state]
  );
  res.json({ reports: rows });
});

// PATCH /community/reports/:id — 处理举报
router.patch('/community/reports/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { action } = req.body; // 'resolve' | 'dismiss'
  const newState = action === 'resolve' ? 'resolved' : 'dismissed';
  await query(
    `UPDATE community_reports SET state = $1, resolved_by = $2, resolved_at = now() WHERE id = $3`,
    [newState, req.user.id, req.params.id]
  );
  res.json({ ok: true });
});

// ── 线上活动 ──────────────────────────────────────────────

// GET /community/groups/:id/events — 小组活动列表
router.get('/community/groups/:id/events', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  const { rows } = await query(
    `SELECT e.*,
            (SELECT COUNT(*)::int FROM community_event_rsvps WHERE event_id = e.id AND status = 'going') AS attendee_count,
            (SELECT status FROM community_event_rsvps WHERE event_id = e.id AND user_id = $2) AS my_rsvp
       FROM community_events e
      WHERE e.group_id = $1
      ORDER BY e.starts_at ASC`,
    [groupId, req.user.id]
  );
  res.json({ events: rows });
});

// POST /community/groups/:id/events — 创建活动（组长/管理员）
router.post('/community/groups/:id/events', requireAuth, async (req, res) => {
  const groupId = req.params.id;
  if (!(await isGroupAdmin(req.user.id, groupId))) {
    return res.status(403).json({ error: '仅组长可创建活动' });
  }
  const { title, description, location, starts_at, ends_at, max_attendees } = req.body;
  if (!title || !starts_at) return res.status(400).json({ error: '缺少 title 或 starts_at' });
  const row = await one(
    `INSERT INTO community_events (group_id, title, description, location, starts_at, ends_at, max_attendees, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [groupId, title, description || null, location || null, starts_at, ends_at || null, max_attendees || null, req.user.id]
  );
  res.json({ ok: true, id: row.id });
});

// POST /community/events/:id/rsvp — 活动报名
router.post('/community/events/:id/rsvp', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const { status = 'going' } = req.body;
  const event = await one(`SELECT max_attendees FROM community_events WHERE id = $1`, [eventId]);
  if (!event) return res.status(404).json({ error: '活动不存在' });
  if (event.max_attendees && status === 'going') {
    const count = await one(
      `SELECT COUNT(*)::int AS c FROM community_event_rsvps WHERE event_id = $1 AND status = 'going'`,
      [eventId]
    );
    if (count.c >= event.max_attendees) {
      return res.status(409).json({ error: '名额已满' });
    }
  }
  await query(
    `INSERT INTO community_event_rsvps (event_id, user_id, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3`,
    [eventId, req.user.id, status]
  );
  res.json({ ok: true, status });
});

// ── 公告帖子（小组内公告 = post_type = 'announcement'）──
// 创建公告帖用 POST /community/posts 传 post_type='announcement'

// ── 已有路由保持不变 ──────────────────────────────────────

// --- 管理员申请 ---
router.post('/community/admin-apply', requireAuth, async (req, res) => {
  try {
    await query(
      `INSERT INTO community_admin_applications (user_id, state) VALUES ($1, 'pending')`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '已申请' });
    throw e;
  }
});

router.get('/community/admin-applications', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await query(
    `SELECT id, user_id, state, created_at FROM community_admin_applications ORDER BY created_at DESC`
  );
  res.json({ applications: rows });
});

router.patch('/community/admin-applications/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action 须为 approve 或 reject' });
  }
  const state = action === 'approve' ? 'approved' : 'rejected';
  const row = await one(
    `UPDATE community_admin_applications SET state = $1 WHERE id = $2 AND state = 'pending' RETURNING id`,
    [state, req.params.id]
  );
  if (!row) return res.status(404).json({ error: '申请不存在或已处理' });
  res.json({ ok: true });
});

// --- 用户公开信息（社群版） ---
router.get('/community/user/:userId/profile', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const row = await one(
    `SELECT
        u.id,
        COALESCE(pr.nickname, '匿名') AS nickname,
        pr.intro,
        (SELECT COUNT(*) FROM community_posts WHERE author_id = u.id AND state IN ('visible','pinned'))::int AS post_count,
        (SELECT COUNT(*) FROM community_follows WHERE followee_id = u.id)::int AS follower_count,
        (SELECT COUNT(*) FROM community_follows WHERE follower_id = u.id)::int AS following_count,
        EXISTS(SELECT 1 FROM community_follows WHERE follower_id = $1 AND followee_id = u.id) AS followed_by_me
      FROM users u
      LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE u.id = $2`,
    [req.user.id, userId]
  );
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json({ profile: row });
});

// --- 指定用户的帖子时间线 ---
router.get('/community/user/:userId/posts', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const curUserId = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.author_id, p.body AS content, p.state, p.created_at,
            COALESCE(pr.nickname, '匿名') AS author_nickname,
            (SELECT COUNT(*) FROM community_likes WHERE post_id = p.id)::int AS like_count,
            (SELECT COUNT(*) FROM community_comments WHERE post_id = p.id)::int AS comment_count,
            EXISTS(SELECT 1 FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me
       FROM community_posts p
       LEFT JOIN profiles pr ON pr.user_id = p.author_id
      WHERE p.author_id = $2 AND p.state IN ('visible','pinned')
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4`,
    [curUserId, userId, limit, offset]
  );
  res.json({ posts: rows, page, authorId: userId });
});

// --- 推荐用户（活跃投稿+粉丝多的用户，排除自己和已关注） ---
router.get('/community/suggested-users', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT u.id,
            COALESCE(pr.nickname, '匿名') AS nickname,
            pr.intro,
            (SELECT COUNT(*) FROM community_posts WHERE author_id = u.id AND state IN ('visible','pinned'))::int AS post_count,
            (SELECT COUNT(*) FROM community_follows WHERE followee_id = u.id)::int AS follower_count
       FROM users u
       LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE u.id != $1
        AND u.id NOT IN (SELECT followee_id FROM community_follows WHERE follower_id = $1)
        AND EXISTS (SELECT 1 FROM community_posts WHERE author_id = u.id AND state IN ('visible','pinned'))
      ORDER BY (SELECT COUNT(*) FROM community_follows WHERE followee_id = u.id) DESC,
               (SELECT COUNT(*) FROM community_posts WHERE author_id = u.id AND state IN ('visible','pinned')) DESC
      LIMIT 10`,
    [userId]
  );
  res.json({ users: rows });
});

export default router;
