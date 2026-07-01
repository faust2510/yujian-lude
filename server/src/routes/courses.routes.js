// 课程 路由 —— 凯勒《婚姻的意义》MVP
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints, recomputeExposure, grantVipDays } from '../lib/rewards.js';
import { getSetting } from '../settings.js';
import { computeCourseState, shouldGrantCourseCompletionRewards } from '../lib/course-completion.js';
import { gradeCourseExam, publicCourseExam } from '../lib/course-exams.js';

const router = Router();

async function applyCourseCompletion(db, { userId, courseId, unitsDone, totalUnits }) {
  const pastorNodeTotal = await db.query(
    'SELECT count(*)::int AS n FROM course_units WHERE course_id = $1 AND is_pastor_node = TRUE',
    [courseId]
  );
  const pastorNodeCount = pastorNodeTotal.rows[0].n;
  const prog = await db.query(
    'SELECT pastor_confirmed, badge_awarded FROM course_progress WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  const pastorConfirmed = prog.rows[0]?.pastor_confirmed ?? 0;
  const state = computeCourseState({ unitsDone, totalUnits, pastorConfirmed, pastorNodeCount });

  await db.query(
    `UPDATE course_progress SET units_done = $3, state = $4::course_state,
       completed_at = CASE WHEN $4::course_state = 'completed'::course_state AND completed_at IS NULL THEN now() ELSE completed_at END,
       updated_at = now()
     WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId, unitsDone, state]
  );

  let justCompleted = false;
  if (state === 'completed') {
    const lightCourseId = await getSetting('match.light_course_id');
    const grantsRewards = shouldGrantCourseCompletionRewards({ courseId, lightCourseId });
    if (grantsRewards && !prog.rows[0]?.badge_awarded) {
      justCompleted = true;
      await awardPoints(db, userId, 'points.course_complete', { refId: courseId, force: true });
      const vipDays = (await getSetting('course.completion_vip_days'))?.days ?? 14;
      await grantVipDays(db, userId, vipDays);
      await db.query(
        'UPDATE course_progress SET badge_awarded = TRUE WHERE user_id = $1 AND course_id = $2',
        [userId, courseId]
      );
      await recomputeExposure(db, userId);
    }
  }

  return { state, justCompleted };
}

// 课程列表（已发布）
router.get('/courses', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, slug, title, subtitle, description, cover_image, sort_order
       FROM courses WHERE is_published = TRUE ORDER BY sort_order, created_at`
  );
  const points = (await getSetting('points.course_complete'))?.amount ?? 300;
  const vipDays = (await getSetting('course.completion_vip_days'))?.days ?? 14;
  const lightCourseId = await getSetting('match.light_course_id');
  res.json({
    courses: rows.map((course) => {
      const grantsRewards = shouldGrantCourseCompletionRewards({ courseId: course.id, lightCourseId });
      return {
        ...course,
        is_match_gate_course: !grantsRewards,
        reward_points: grantsRewards ? points : 0,
        reward_vip_days: grantsRewards ? vipDays : 0,
      };
    }),
  });
});

// 课程详情 + 单元列表 +（登录则带进度）
router.get('/courses/:slug', async (req, res) => {
  const course = await one('SELECT * FROM courses WHERE slug = $1 AND is_published = TRUE', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const { rows: units } = await query(
    `SELECT id, unit_index, title, material, is_pastor_node
       FROM course_units WHERE course_id = $1 ORDER BY unit_index`,
    [course.id]
  );
  let progress = null;
  let attempts = [];
  if (req.user) {
    progress = await one(
      'SELECT state, units_done, pastor_confirmed, completed_at, badge_awarded FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [req.user.id, course.id]
    );
    const { rows: ua } = await query(
      `SELECT cu.unit_index, a.passed, a.score
         FROM unit_attempts a JOIN course_units cu ON cu.id = a.unit_id
        WHERE a.user_id = $1 AND cu.course_id = $2`,
      [req.user.id, course.id]
    );
    attempts = ua;
    const latestExam = await one(
      `SELECT score, passed, created_at
         FROM course_exam_attempts
        WHERE user_id = $1 AND course_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, course.id]
    );
    progress = progress ? { ...progress, latest_exam: latestExam ?? null } : progress;
  }
  res.json({ course, units, progress, attempts });
});

// 报名 / 开始课程
router.post('/courses/:slug/enroll', requireAuth, async (req, res) => {
  const course = await one('SELECT id FROM courses WHERE slug = $1', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  await query(
    `INSERT INTO course_progress (user_id, course_id, state, units_done)
     VALUES ($1, $2, 'in_progress', 0)
     ON CONFLICT (user_id, course_id) DO NOTHING`,
    [req.user.id, course.id]
  );
  res.json({ ok: true });
});

// 标记单元阅读完成。最终完课由结课考试决定，不能只靠打卡完成课程。
router.post('/courses/:slug/units/:index/submit', requireAuth, async (req, res) => {
  const { readConfirmed = false } = req.body ?? {};
  if (readConfirmed !== true) return res.status(400).json({ error: '请先阅读本单元文本，再确认已阅读' });
  const course = await one('SELECT id FROM courses WHERE slug = $1', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const unit = await one(
    'SELECT id, is_pastor_node FROM course_units WHERE course_id = $1 AND unit_index = $2',
    [course.id, Number(req.params.index)]
  );
  if (!unit) return res.status(404).json({ error: '单元不存在' });

  const out = await tx(async (db) => {
    await db.query(
      `INSERT INTO course_progress (user_id, course_id, state, units_done)
       VALUES ($1, $2, 'in_progress', 0)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user.id, course.id]
    );

    await db.query(
      `INSERT INTO unit_attempts (user_id, unit_id, passed, score, qa_log)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, unit_id) DO UPDATE SET passed = $3, score = $4, qa_log = $5`,
      [req.user.id, unit.id, true, 1, JSON.stringify([{ type: 'reading', readConfirmed: true }])]
    );
    // 统计已阅读单元数
    const done = await db.query(
      `SELECT count(*)::int AS n FROM unit_attempts a
         JOIN course_units cu ON cu.id = a.unit_id
        WHERE a.user_id = $1 AND cu.course_id = $2 AND a.passed = TRUE`,
      [req.user.id, course.id]
    );
    const unitsDone = done.rows[0].n;
    const total = await db.query('SELECT count(*)::int AS n FROM course_units WHERE course_id = $1', [course.id]);
    const totalUnits = total.rows[0].n;
    const prog = await db.query(
      'SELECT state FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [req.user.id, course.id]
    );
    const state = ['completed', 'pastor_review'].includes(prog.rows[0]?.state)
      ? prog.rows[0].state
      : 'in_progress';

    await db.query(
      `UPDATE course_progress SET units_done = $3, state = $4::course_state,
         updated_at = now()
       WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, course.id, unitsDone, state]
    );
    return { unitsDone, totalUnits, state, examReady: unitsDone >= totalUnits, isPastorNode: unit.is_pastor_node };
  });
  res.json({ ok: true, ...out });
});

router.get('/courses/:slug/exam', requireAuth, async (req, res) => {
  const course = await one('SELECT id, slug FROM courses WHERE slug = $1 AND is_published = TRUE', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const total = await one('SELECT count(*)::int AS n FROM course_units WHERE course_id = $1', [course.id]);
  const done = await one(
    `SELECT count(*)::int AS n FROM unit_attempts a
       JOIN course_units cu ON cu.id = a.unit_id
      WHERE a.user_id = $1 AND cu.course_id = $2 AND a.passed = TRUE`,
    [req.user.id, course.id]
  );
  if ((done?.n ?? 0) < (total?.n ?? 0)) {
    return res.status(409).json({ error: '请先读完全部课程单元，再参加结课考试' });
  }
  try {
    res.json(publicCourseExam(course.slug));
  } catch {
    res.status(404).json({ error: '课程考试不存在' });
  }
});

router.post('/courses/:slug/exam/submit', requireAuth, async (req, res) => {
  const course = await one('SELECT id, slug FROM courses WHERE slug = $1 AND is_published = TRUE', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });

  let graded;
  try {
    graded = gradeCourseExam(course.slug, req.body?.answers);
  } catch {
    return res.status(404).json({ error: '课程考试不存在' });
  }

  const out = await tx(async (db) => {
    await db.query(
      `INSERT INTO course_progress (user_id, course_id, state, units_done)
       VALUES ($1, $2, 'in_progress', 0)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user.id, course.id]
    );
    const total = await db.query('SELECT count(*)::int AS n FROM course_units WHERE course_id = $1', [course.id]);
    const totalUnits = total.rows[0].n;
    const done = await db.query(
      `SELECT count(*)::int AS n FROM unit_attempts a
         JOIN course_units cu ON cu.id = a.unit_id
        WHERE a.user_id = $1 AND cu.course_id = $2 AND a.passed = TRUE`,
      [req.user.id, course.id]
    );
    const unitsDone = done.rows[0].n;
    if (unitsDone < totalUnits) return { blocked: true, unitsDone, totalUnits };

    await db.query(
      `INSERT INTO course_exam_attempts (user_id, course_id, score, passed, answers)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, course.id, graded.score, graded.passed, JSON.stringify(req.body?.answers ?? [])]
    );

    if (!graded.passed) return { blocked: false, unitsDone, totalUnits, state: 'in_progress', justCompleted: false };
    const completion = await applyCourseCompletion(db, {
      userId: req.user.id,
      courseId: course.id,
      unitsDone,
      totalUnits,
    });
    return { blocked: false, unitsDone, totalUnits, ...completion };
  });

  if (out.blocked) {
    return res.status(409).json({ error: '请先读完全部课程单元，再参加结课考试', unitsDone: out.unitsDone, totalUnits: out.totalUnits });
  }
  res.json({ ok: true, ...graded, unitsDone: out.unitsDone, totalUnits: out.totalUnits, state: out.state, justCompleted: out.justCompleted });
});

export default router;
