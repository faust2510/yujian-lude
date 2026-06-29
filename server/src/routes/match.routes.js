// 匿名匹配 路由 —— 曝光排序只认课程+背书，硬门槛由资格中心统一判断
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints } from '../lib/rewards.js';
import { getSetting } from '../settings.js';
import { getMatchGateSettings, getMatchQualification, isInMatchPool } from '../lib/match-gate.js';
import { normalizeMatchIntent, statusForIntent } from '../lib/match-intent.js';

const router = Router();
const ACTIVE_MATCH_STATUSES = ['intent_sent', 'matched', 'under_review', 'approved'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 我的进池状态（统一返回所有资格门槛，前端据此展示下一步）
router.get('/match/status', requireAuth, async (req, res) => {
  res.json(await getMatchQualification(req.user.id));
});

// 匿名候选列表（按曝光分降序；曝光分 = 课程+背书算出，钱买不到）
router.get('/match/candidates', requireAuth, async (req, res) => {
  if (!(await isInMatchPool(req.user.id))) {
    const status = await getMatchQualification(req.user.id);
    return res.json({ candidates: [], locked: true, reason: status.gate, status });
  }
  const { min_age, max_age, city } = req.query;
  const params = [req.user.id];
  const filters = [];
  if (min_age) { params.push(new Date().getFullYear() - Number(min_age)); filters.push(`p.birth_year <= $${params.length}`); }
  if (max_age) { params.push(new Date().getFullYear() - Number(max_age)); filters.push(`p.birth_year >= $${params.length}`); }
  if (city)    { params.push(`%${city}%`);                                 filters.push(`p.city ILIKE $${params.length}`); }
  const where = filters.length ? 'AND ' + filters.join(' AND ') : '';
  const gate = await getMatchGateSettings();
  const eligibilityFilters = [
    'p.privacy_ok = TRUE',
    'p.completion >= 100',
    `EXISTS(SELECT 1 FROM faith_profiles fp WHERE fp.user_id = u.id AND NULLIF(BTRIM(fp.church_name), '') IS NOT NULL AND NULLIF(BTRIM(fp.testimony), '') IS NOT NULL)`,
  ];
  if (gate.requireEndorsement) {
    eligibilityFilters.push(`EXISTS(SELECT 1 FROM endorsements en WHERE en.user_id = u.id AND en.kind IN ('pastor','referrer') AND en.state='verified')`);
  }
  if (gate.requireTest) {
    eligibilityFilters.push(`COALESCE((SELECT ft.passed FROM faith_tests ft WHERE ft.user_id = u.id ORDER BY ft.created_at DESC LIMIT 1), FALSE) = TRUE`);
  }
  if (gate.requireCourse) {
    if (!gate.lightCourseId) {
      return res.json({ candidates: [], locked: false });
    }
    params.push(gate.lightCourseId);
    eligibilityFilters.push(`EXISTS(SELECT 1 FROM course_progress cp_gate WHERE cp_gate.user_id = u.id AND cp_gate.course_id = $${params.length} AND cp_gate.state='completed')`);
  }

  const { rows } = await query(
    `SELECT u.id, p.nickname, p.city, p.birth_year, p.goal, p.intro,
            p.education, fp.church_name, e.computed_score,
            EXISTS(SELECT 1 FROM course_progress cp WHERE cp.user_id = u.id AND cp.state='completed' AND cp.badge_awarded) AS has_badge
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN faith_profiles fp ON fp.user_id = u.id
       LEFT JOIN exposure e ON e.user_id = u.id
      WHERE u.id <> $1 AND u.is_banned = FALSE
        AND NOT EXISTS(SELECT 1 FROM relationships r
              WHERE ((r.user_a=$1 AND r.user_b=u.id) OR (r.user_b=$1 AND r.user_a=u.id))
                AND r.state <> 'ended')
        AND ${eligibilityFilters.join('\n        AND ')}
        ${where}
      ORDER BY e.computed_score DESC NULLS LAST, u.created_at DESC
      LIMIT 30`,
    params
  );
  res.json({ candidates: rows, locked: false });
});

// 表达意向（质量动作，每日 1 次积分，受日上限约束）
router.post('/match/:targetId/intent', requireAuth, async (req, res) => {
  const targetId = req.params.targetId;
  if (!UUID_RE.test(targetId)) return res.status(400).json({ error: '候选人不存在' });
  if (targetId === req.user.id) return res.status(400).json({ error: '不能对自己表达意向' });
  const intent = normalizeMatchIntent(req.body?.intent);
  if (!intent) return res.status(400).json({ error: '非法意向操作' });
  const nextStatus = statusForIntent(intent);
  if (!(await isInMatchPool(req.user.id))) return res.status(403).json({ error: '尚未进入匹配池' });

  const target = await one(
    `SELECT id FROM users WHERE id = $1 AND is_banned = FALSE`,
    [targetId]
  );
  if (!target) return res.status(404).json({ error: '候选人不存在' });
  if (!(await isInMatchPool(targetId))) return res.status(403).json({ error: '对方尚未进入匹配池' });

  const existing = await one(
    `SELECT status FROM matches WHERE user_id = $1 AND target_id = $2`,
    [req.user.id, targetId]
  );
  if (intent === 'like' && existing?.status === 'matched') {
    return res.json({ ok: true, mutual: true });
  }
  const alreadyExpressed = intent === 'like' && ACTIVE_MATCH_STATUSES.includes(existing?.status);

  // 每日主动次数上限（VIP 更多）
  if (intent === 'like' && !alreadyExpressed) {
    const limKey = req.user.is_vip ? 'limits.daily_intents_vip' : 'limits.daily_intents_free';
    const lim = (await getSetting(limKey))?.value ?? (req.user.is_vip ? 15 : 3);
    const used = await one(
      `SELECT count(*)::int AS n FROM matches
        WHERE user_id = $1 AND intent_sent_at::date = CURRENT_DATE`,
      [req.user.id]
    );
    if ((used?.n ?? 0) >= lim) {
      return res.status(429).json({ error: `今日主动次数已用完（${lim} 次）`, isVip: req.user.is_vip });
    }
  }

  let mutual = false;
  await tx(async (db) => {
    const [a, b] = [req.user.id, targetId].sort();
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [a, b]);

    const upserted = await db.query(
      `INSERT INTO matches (user_id, target_id, status, intent_sent_at, updated_at)
       VALUES (
         $1,
         $2,
         $3::match_status,
         CASE WHEN $3::match_status = 'intent_sent'::match_status THEN now() ELSE NULL END,
         now()
       )
       ON CONFLICT (user_id, target_id) DO UPDATE SET
         status = CASE
           WHEN EXCLUDED.status = 'declined'::match_status
             AND matches.status IN ('intent_sent','matched','under_review','approved') THEN matches.status
           WHEN EXCLUDED.status = 'intent_sent'::match_status
             AND matches.status IN ('matched','under_review','approved') THEN matches.status
           ELSE EXCLUDED.status
         END,
         intent_sent_at = CASE
           WHEN EXCLUDED.status = 'intent_sent'::match_status
             AND matches.status IN ('intent_sent','matched','under_review','approved') THEN matches.intent_sent_at
           WHEN EXCLUDED.status = 'intent_sent'::match_status THEN now()
           ELSE matches.intent_sent_at
         END,
         updated_at = now()
       RETURNING id, status`,
      [req.user.id, targetId, nextStatus]
    );
    if (intent === 'pass') return;

    await awardPoints(db, req.user.id, 'points.intent_sent', {});
    // 检查是否互相心动 → 自动建私聊通道
    const reverse = await db.query(
      `SELECT 1 FROM matches
        WHERE user_id=$1 AND target_id=$2
          AND status IN ('intent_sent','matched')`,
      [targetId, req.user.id]
    );
    if (upserted.rows[0]?.status === 'matched' || reverse.rows.length) {
      mutual = true;
      const matchId = upserted.rows[0]?.id;
      if (matchId) {
        await db.query(
          `INSERT INTO chat_channels (match_id, user_a, user_b) VALUES ($1,$2,$3)
           ON CONFLICT (user_a, user_b) DO NOTHING`,
          [matchId, a, b]
        );
      }
      await db.query(
        `UPDATE matches SET status='matched', updated_at=now()
          WHERE ((user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1))
            AND status IN ('intent_sent','matched')`,
        [req.user.id, targetId]
      );
    }
  });
  res.json({ ok: true, mutual });
});

// 谁看过我（VIP 专属）
router.get('/match/viewers', requireAuth, async (req, res) => {
  if (!req.user.is_vip) return res.status(403).json({ error: 'VIP 专属功能', upsell: true });
  const { rows } = await query(
    `SELECT v.viewer_id, p.nickname, p.city, v.viewed_at
       FROM profile_views v JOIN profiles p ON p.user_id = v.viewer_id
      WHERE v.viewed_id = $1 ORDER BY v.viewed_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ viewers: rows });
});

// 记录一次浏览（任何登录用户）
router.post('/match/:targetId/view', requireAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.targetId)) return res.status(400).json({ error: '候选人不存在' });
  if (req.params.targetId === req.user.id) return res.json({ ok: true });
  await query(
    `INSERT INTO profile_views (viewer_id, viewed_id) VALUES ($1, $2)`,
    [req.user.id, req.params.targetId]
  );
  res.json({ ok: true });
});

export default router;
