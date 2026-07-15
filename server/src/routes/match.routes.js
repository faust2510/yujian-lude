// 匿名匹配 路由 —— 曝光排序只认课程+背书，硬门槛由资格中心统一判断
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints } from '../lib/rewards.js';
import { getSetting } from '../settings.js';
import { getMatchGateSettings, getMatchQualification, isInMatchPool } from '../lib/match-gate.js';
import { normalizeMatchIntent, statusForIntent } from '../lib/match-intent.js';
import { normalizeMatchFilters } from '../lib/match-filters.js';

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
  const normalized = normalizeMatchFilters(req.query, { vipPlan: req.user.vip_plan });
  if (!normalized.ok) {
    return res.status(normalized.status).json({ error: normalized.error, upsell: normalized.upsell === true });
  }
  const candidateFilters = normalized.filters;
  const params = [req.user.id];
  const filters = [];
  if (candidateFilters.minAge !== undefined) {
    params.push(candidateFilters.minAge);
    filters.push(`p.birth_date <= ((now() AT TIME ZONE 'Asia/Shanghai')::date - ($${params.length} * INTERVAL '1 year'))::date`);
  }
  if (candidateFilters.maxAge !== undefined) {
    params.push(candidateFilters.maxAge + 1);
    filters.push(`p.birth_date > ((now() AT TIME ZONE 'Asia/Shanghai')::date - ($${params.length} * INTERVAL '1 year'))::date`);
  }
  if (candidateFilters.city) { params.push(`%${candidateFilters.city}%`); filters.push(`p.city ILIKE $${params.length}`); }
  if (candidateFilters.education) { params.push(`%${candidateFilters.education}%`); filters.push(`p.education ILIKE $${params.length}`); }
  if (candidateFilters.goal) { params.push(candidateFilters.goal); filters.push(`p.goal = $${params.length}`); }
  if (candidateFilters.denomination) { params.push(`%${candidateFilters.denomination}%`); filters.push(`fp.denomination ILIKE $${params.length}`); }
  if (candidateFilters.presbytery) { params.push(`%${candidateFilters.presbytery}%`); filters.push(`fp.presbytery ILIKE $${params.length}`); }
  if (candidateFilters.minFaithYears !== undefined) { params.push(candidateFilters.minFaithYears); filters.push(`fp.faith_years >= $${params.length}`); }
  if (candidateFilters.hasBadge === true) {
    filters.push(`EXISTS(SELECT 1 FROM course_progress cp_filter WHERE cp_filter.user_id = u.id AND cp_filter.state='completed' AND cp_filter.badge_awarded)`);
  } else if (candidateFilters.hasBadge === false) {
    filters.push(`NOT EXISTS(SELECT 1 FROM course_progress cp_filter WHERE cp_filter.user_id = u.id AND cp_filter.state='completed' AND cp_filter.badge_awarded)`);
  }
  const where = filters.length ? 'AND ' + filters.join(' AND ') : '';
  const gate = await getMatchGateSettings();
  const eligibilityFilters = [
    'p.privacy_ok = TRUE',
    'p.completion >= 100',
    "p.birth_date <= ((now() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '18 years')::date",
    `EXISTS(
      SELECT 1 FROM faith_profiles fp
       WHERE fp.user_id = u.id
         AND NULLIF(BTRIM(fp.church_name), '') IS NOT NULL
         AND NULLIF(BTRIM(fp.presbytery), '') IS NOT NULL
         AND NULLIF(BTRIM(fp.region), '') IS NOT NULL
         AND NULLIF(BTRIM(fp.denomination), '') IS NOT NULL
         AND fp.baptism_date IS NOT NULL
         AND fp.faith_years >= 0
         AND NULLIF(BTRIM(fp.testimony), '') IS NOT NULL
    )`,
  ];
  if (gate.requireEndorsement) {
    eligibilityFilters.push(`EXISTS(SELECT 1 FROM endorsements en WHERE en.user_id = u.id AND en.kind IN ('pastor','referrer') AND en.state='verified')`);
  }
  if (gate.requireTest) {
    eligibilityFilters.push(`EXISTS(SELECT 1 FROM faith_tests ft WHERE ft.user_id = u.id AND ft.passed = TRUE)`);
  }
  if (gate.requireCourse) {
    if (!gate.lightCourseId) {
      return res.json({ candidates: [], locked: false });
    }
    params.push(gate.lightCourseId);
    eligibilityFilters.push(`EXISTS(SELECT 1 FROM course_progress cp_gate WHERE cp_gate.user_id = u.id AND cp_gate.course_id = $${params.length} AND cp_gate.state='completed')`);
  }

  const { rows } = await query(
    `SELECT u.id, p.nickname, p.city, p.birth_year,
            EXTRACT(YEAR FROM age((now() AT TIME ZONE 'Asia/Shanghai')::date, p.birth_date))::int AS age,
            p.goal, p.intro,
            p.education, fp.church_name, fp.presbytery, fp.denomination, fp.faith_years,
            e.computed_score,
            EXISTS(SELECT 1 FROM course_progress cp WHERE cp.user_id = u.id AND cp.state='completed' AND cp.badge_awarded) AS has_badge
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN faith_profiles fp ON fp.user_id = u.id
       LEFT JOIN exposure e ON e.user_id = u.id
      WHERE u.id <> $1 AND u.is_banned = FALSE
        AND NOT EXISTS(SELECT 1 FROM relationships r
              WHERE (r.user_a = u.id OR r.user_b = u.id)
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

  const limitKey = req.user.is_vip ? 'limits.daily_intents_vip' : 'limits.daily_intents_free';
  const limit = intent === 'like'
    ? (await getSetting(limitKey))?.value ?? (req.user.is_vip ? 15 : 3)
    : null;

  const outcome = await tx(async (db) => {
    await db.query(
      `SELECT pg_advisory_xact_lock(lock_id)
         FROM unnest(ARRAY[
           hashtextextended($1::text, 0),
           hashtextextended($2::text, 0)
         ]) AS participant_locks(lock_id)
        ORDER BY lock_id`,
      [req.user.id, targetId]
    );
    const activeRelationship = await db.query(
      `SELECT 1
         FROM relationships
        WHERE state <> 'ended'
          AND (user_a IN ($1, $2) OR user_b IN ($1, $2))
        LIMIT 1`,
      [req.user.id, targetId]
    );
    if (activeRelationship.rows.length) return { unavailable: true, limited: false, mutual: false };

    if (intent === 'like') {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id]);
      const existing = await db.query(
        `SELECT status FROM matches WHERE user_id = $1 AND target_id = $2`,
        [req.user.id, targetId]
      );
      if (existing.rows[0]?.status === 'matched') return { limited: false, mutual: true };

      const alreadyExpressed = ACTIVE_MATCH_STATUSES.includes(existing.rows[0]?.status);
      if (!alreadyExpressed) {
        const used = await db.query(
          `SELECT count(*)::int AS n FROM matches
            WHERE user_id = $1 AND intent_sent_at::date = CURRENT_DATE`,
          [req.user.id]
        );
        if ((used.rows[0]?.n ?? 0) >= limit) return { limited: true, mutual: false };
      }
    }

    let mutual = false;
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
    if (intent === 'pass') return { limited: false, mutual: false };

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
    return { limited: false, mutual };
  });
  if (outcome.unavailable) {
    return res.status(409).json({ error: '你或对方已有进行中的关系' });
  }
  if (outcome.limited) {
    return res.status(429).json({ error: `今日主动次数已用完（${limit} 次）`, isVip: req.user.is_vip });
  }
  res.json({ ok: true, mutual: outcome.mutual });
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
  const targetId = req.params.targetId;
  if (!UUID_RE.test(targetId)) return res.status(400).json({ error: '候选人不存在' });
  if (targetId === req.user.id) return res.json({ ok: true });
  if (!(await isInMatchPool(req.user.id))) {
    return res.status(403).json({ error: '尚未进入匹配池' });
  }
  const target = await one(
    `SELECT id FROM users WHERE id = $1 AND is_banned = FALSE`,
    [targetId]
  );
  if (!target || !(await isInMatchPool(targetId))) {
    return res.status(404).json({ error: '候选人不存在' });
  }
  const activeRelationship = await one(
    `SELECT 1
       FROM relationships
      WHERE ((user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1))
        AND state <> 'ended'
      LIMIT 1`,
    [req.user.id, targetId]
  );
  if (activeRelationship) return res.status(404).json({ error: '候选人不存在' });
  await query(
    `INSERT INTO profile_views (viewer_id, viewed_id) VALUES ($1, $2)`,
    [req.user.id, targetId]
  );
  res.json({ ok: true });
});

export default router;
