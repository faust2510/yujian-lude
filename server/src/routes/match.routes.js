// 匿名匹配 路由 —— 曝光排序只认课程+背书，硬门槛由资格中心统一判断
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints } from '../lib/rewards.js';
import { getSetting } from '../settings.js';
import { buildMatchQualification } from '../lib/match-qualification.js';

const router = Router();

function settingValue(setting) {
  return setting && typeof setting === 'object' && 'value' in setting ? setting.value : setting;
}

async function getMatchGateSettings() {
  return {
    requireTest: settingValue(await getSetting('match.require_faith_test')) !== false,
    requireEndorsement: settingValue(await getSetting('match.require_verified_pastor')) !== false,
    requireCourse: settingValue(await getSetting('match.require_light_course')) !== false,
    lightCourseId: settingValue(await getSetting('match.light_course_id')),
  };
}

async function getQualification(userId) {
  const gate = await getMatchGateSettings();
  const profile = await one('SELECT completion, privacy_ok FROM profiles WHERE user_id=$1', [userId]);
  const faith = await one('SELECT church_name, testimony FROM faith_profiles WHERE user_id=$1', [userId]);
  const testRow = await one(
    `SELECT passed FROM faith_tests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const { rows: endorsements } = await query(
    `SELECT kind, state FROM endorsements WHERE user_id = $1`,
    [userId]
  );

  let lightCourseCompleted = true;
  if (gate.requireCourse) {
    lightCourseCompleted = false;
    if (gate.lightCourseId) {
      const done = await one(
        `SELECT 1 FROM course_progress WHERE user_id = $1 AND course_id = $2 AND state = 'completed' LIMIT 1`,
        [userId, gate.lightCourseId]
      );
      lightCourseCompleted = !!done;
    }
  }

  const status = buildMatchQualification({
    profile,
    faith,
    faithTestPassed: gate.requireTest ? !!testRow?.passed : true,
    endorsements: gate.requireEndorsement ? endorsements : [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted,
  });

  return status;
}

async function inMatchPool(userId) {
  return (await getQualification(userId)).inPool;
}

// 我的进池状态（统一返回所有资格门槛，前端据此展示下一步）
router.get('/match/status', requireAuth, async (req, res) => {
  res.json(await getQualification(req.user.id));
});

// 匿名候选列表（按曝光分降序；曝光分 = 课程+背书算出，钱买不到）
router.get('/match/candidates', requireAuth, async (req, res) => {
  if (!(await inMatchPool(req.user.id))) {
    const status = await getQualification(req.user.id);
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
  if (targetId === req.user.id) return res.status(400).json({ error: '不能对自己表达意向' });
  if (!(await inMatchPool(req.user.id))) return res.status(403).json({ error: '尚未进入匹配池' });

  // 每日主动次数上限（VIP 更多）
  const limKey = req.user.is_vip ? 'limits.daily_intents_vip' : 'limits.daily_intents_free';
  const lim = (await getSetting(limKey))?.value ?? (req.user.is_vip ? 15 : 3);
  const used = await one(
    `SELECT count(*)::int AS n FROM matches
      WHERE user_id = $1 AND status <> 'suggested' AND created_at::date = CURRENT_DATE`,
    [req.user.id]
  );
  if ((used?.n ?? 0) >= lim) {
    return res.status(429).json({ error: `今日主动次数已用完（${lim} 次）`, isVip: req.user.is_vip });
  }

  let mutual = false;
  await tx(async (db) => {
    await db.query(
      `INSERT INTO matches (user_id, target_id, status)
       VALUES ($1, $2, 'intent_sent')
       ON CONFLICT (user_id, target_id) DO UPDATE SET status = 'intent_sent'`,
      [req.user.id, targetId]
    );
    await awardPoints(db, req.user.id, 'points.intent_sent', {});
    // 检查是否互相心动 → 自动建私聊通道
    const reverse = await db.query(
      `SELECT 1 FROM matches WHERE user_id=$1 AND target_id=$2 AND status='intent_sent'`,
      [targetId, req.user.id]
    );
    if (reverse.rows.length) {
      mutual = true;
      const [a, b] = [req.user.id, targetId].sort();
      // 获取 match_id（两条 match 行中取一条即可）
      const matchRow = await db.query(
        `SELECT id FROM matches WHERE user_id=$1 AND target_id=$2`,
        [req.user.id, targetId]
      );
      const matchId = matchRow.rows[0]?.id;
      if (matchId) {
        await db.query(
          `INSERT INTO chat_channels (match_id, user_a, user_b) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [matchId, a, b]
        );
      }
      await db.query(
        `UPDATE matches SET status='matched'
          WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)`,
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
  if (req.params.targetId === req.user.id) return res.json({ ok: true });
  await query(
    `INSERT INTO profile_views (viewer_id, viewed_id) VALUES ($1, $2)`,
    [req.user.id, req.params.targetId]
  );
  res.json({ ok: true });
});

export default router;
