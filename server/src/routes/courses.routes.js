// 课程 路由 —— 凯勒《婚姻的意义》MVP
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints, recomputeExposure, grantVipDays } from '../lib/rewards.js';
import { getSetting } from '../settings.js';
import { computeCourseState, shouldGrantCourseCompletionRewards } from '../lib/course-completion.js';
import {
  canAccessCoursePastorReview,
  canRequestCoursePastorReview,
  normalizeCoursePastorReviewAction,
  validateCoursePastorReviewNote,
} from '../lib/course-pastor-review.js';
import { gradeCourseExam, publicCourseExam } from '../lib/course-exams.js';
import {
  getCourseRequiredTextbookBindingIssue,
  incompleteRequiredReadings,
  readingsForCourseUnits,
} from '../lib/textbook-reading.js';
import { writeAdminAudit } from '../lib/admin-audit.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function applyCourseCompletion(db, { userId, courseId, unitsDone, totalUnits }) {
  const pastorNodeTotal = await db.query(
    `SELECT unit_index
       FROM course_units
      WHERE course_id = $1 AND is_pastor_node = TRUE
      ORDER BY unit_index`,
    [courseId]
  );
  const pastorNodeIndexes = pastorNodeTotal.rows.map((row) => row.unit_index);
  const pastorNodeCount = pastorNodeIndexes.length;
  const prog = await db.query(
    'SELECT state, pastor_confirmed, badge_awarded FROM course_progress WHERE user_id = $1 AND course_id = $2 FOR UPDATE',
    [userId, courseId]
  );
  const pastorConfirmed = prog.rows[0]?.pastor_confirmed ?? 0;
  const passedExam = await db.query(
    `SELECT EXISTS(
       SELECT 1 FROM course_exam_attempts
        WHERE user_id = $1 AND course_id = $2 AND passed = TRUE
     ) AS passed`,
    [userId, courseId]
  );
  const state = computeCourseState({
    currentState: prog.rows[0]?.state,
    unitsDone,
    totalUnits,
    pastorConfirmed,
    pastorNodeCount,
    pastorNodeIndexes,
    examPassed: passedExam.rows[0]?.passed === true,
  });

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
      const claimed = await db.query(
        `UPDATE course_progress
            SET badge_awarded = TRUE, updated_at = now()
          WHERE user_id = $1 AND course_id = $2 AND badge_awarded = FALSE
          RETURNING id`,
        [userId, courseId]
      );
      if (claimed.rows.length) {
        const points = await awardPoints(db, userId, 'points.course_complete', {
          refId: courseId,
          force: true,
        });
        if (points.awarded) {
          justCompleted = true;
          const vipDays = (await getSetting('course.completion_vip_days'))?.days ?? 14;
          await grantVipDays(db, userId, vipDays);
        }
        await recomputeExposure(db, userId);
      }
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

router.get('/course-pastor-reviews', requireAuth, async (req, res) => {
  const state = String(req.query.state || 'pending');
  if (!['pending', 'approved', 'rejected'].includes(state)) {
    return res.status(400).json({ error: '审核状态不正确' });
  }
  const isAdmin = req.user.role === 'admin';
  const { rows } = await query(
    `SELECT r.id, r.user_id, r.course_id, r.unit_id, r.state, r.requested_note, r.review_note,
            r.assigned_reviewer_id, r.created_at, r.reviewed_at,
            c.slug AS course_slug, c.title AS course_title,
            cu.unit_index, cu.title AS unit_title,
            p.nickname, fp.church_name, cp.units_done,
            e.kind AS endorsement_kind, e.name AS endorsement_name,
            e.church AS endorsement_church,
            exam.score AS exam_score, exam.passed AS exam_passed
       FROM course_pastor_reviews r
       JOIN courses c ON c.id = r.course_id
       LEFT JOIN course_units cu ON cu.id = r.unit_id
       JOIN course_progress cp ON cp.user_id = r.user_id AND cp.course_id = r.course_id
       LEFT JOIN endorsements e ON e.id = r.endorsement_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       LEFT JOIN faith_profiles fp ON fp.user_id = r.user_id
       LEFT JOIN LATERAL (
         SELECT score, passed
           FROM course_exam_attempts
          WHERE user_id = r.user_id AND course_id = r.course_id
          ORDER BY created_at DESC LIMIT 1
       ) exam ON TRUE
      WHERE r.state = $1
        AND r.user_id <> $2
        AND ($3::boolean OR r.assigned_reviewer_id = $2)
      ORDER BY r.created_at ASC
      LIMIT 100`,
    [state, req.user.id, isAdmin]
  );
  res.json({ reviews: rows });
});

router.patch('/course-pastor-reviews/:id', requireAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: '审核申请不存在' });
  const nextState = normalizeCoursePastorReviewAction(req.body?.action);
  if (!nextState) return res.status(400).json({ error: 'action 须为 approve 或 reject' });
  const note = String(req.body?.note || '').trim().slice(0, 1000) || null;
  const noteError = validateCoursePastorReviewNote({ action: req.body?.action, note });
  if (noteError) return res.status(400).json({ error: noteError });

  const out = await tx(async (db) => {
    const reviewResult = await db.query(
      `SELECT r.*, cp.units_done, cp.state AS progress_state
         FROM course_pastor_reviews r
         JOIN course_progress cp ON cp.user_id = r.user_id AND cp.course_id = r.course_id
        WHERE r.id = $1
        FOR UPDATE OF r, cp`,
      [req.params.id]
    );
    const review = reviewResult.rows[0];
    if (!review) return { missing: true };
    if (!canAccessCoursePastorReview({
      actorId: req.user.id,
      actorRole: req.user.role,
      subjectId: review.user_id,
      assignedReviewerId: review.assigned_reviewer_id,
    })) {
      return { unauthorized: true };
    }
    if (review.state !== 'pending') return { conflict: true, state: review.state };

    let completion = { state: review.progress_state, justCompleted: false };
    if (nextState === 'approved') {
      if (review.progress_state !== 'pastor_review') {
        return { conflict: true, state: review.progress_state };
      }
    }

    await db.query(
      `UPDATE course_pastor_reviews
          SET state = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now()
        WHERE id = $1`,
      [review.id, nextState, note, req.user.id]
    );

    if (nextState === 'approved') {
      const totals = await db.query(
        `SELECT count(*)::int AS total_units,
                count(*) FILTER (WHERE is_pastor_node = TRUE)::int AS pastor_nodes
           FROM course_units WHERE course_id = $1`,
        [review.course_id]
      );
      const totalUnits = totals.rows[0]?.total_units ?? 0;
      const pastorNodes = totals.rows[0]?.pastor_nodes ?? 0;
      const approved = await db.query(
        `SELECT COUNT(DISTINCT unit_id)::int AS confirmed
           FROM course_pastor_reviews
          WHERE user_id = $1 AND course_id = $2
            AND state = 'approved' AND unit_id IS NOT NULL`,
        [review.user_id, review.course_id]
      );
      const confirmedNodes = Math.min(approved.rows[0]?.confirmed ?? 0, pastorNodes);
      await db.query(
        `UPDATE course_progress SET pastor_confirmed = $3, updated_at = now()
          WHERE user_id = $1 AND course_id = $2`,
        [review.user_id, review.course_id, confirmedNodes]
      );
      completion = await applyCourseCompletion(db, {
        userId: review.user_id,
        courseId: review.course_id,
        unitsDone: review.units_done,
        totalUnits,
      });
    }

    await writeAdminAudit(db, {
      actorId: req.user.id,
      action: 'course.pastor_review',
      targetType: 'course_pastor_review',
      targetId: review.id,
      detail: {
        state: nextState,
        user_id: review.user_id,
        course_id: review.course_id,
        unit_id: review.unit_id,
        endorsement_id: review.endorsement_id,
        review_note: note,
      },
    });
    return { review, completion };
  });

  if (out.missing) return res.status(404).json({ error: '审核申请不存在' });
  if (out.unauthorized) return res.status(404).json({ error: '审核申请不存在或未分配给你' });
  if (out.conflict) return res.status(409).json({ error: '审核申请状态已变化，请刷新后重试', state: out.state });
  res.json({ ok: true, state: nextState, courseState: out.completion.state, justCompleted: out.completion.justCompleted });
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
  const readingsByUnit = await readingsForCourseUnits({ query }, { courseId: course.id, userId: req.user?.id ?? null });
  const unitsWithReadings = units.map((unit) => ({
    ...unit,
    readings: readingsByUnit.get(unit.id) ?? [],
  }));
  let progress = null;
  let attempts = [];
  let reviewOptions = [];
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
    const { rows: pastorReviews } = await query(
      `SELECT r.id, r.unit_id, r.state, r.requested_note, r.review_note, r.reviewed_at, r.created_at,
              r.endorsement_id, e.kind AS endorsement_kind, e.name AS endorsement_name,
              cu.unit_index, cu.title AS unit_title
         FROM course_pastor_reviews r
         LEFT JOIN endorsements e ON e.id = r.endorsement_id
         LEFT JOIN course_units cu ON cu.id = r.unit_id
        WHERE r.user_id = $1 AND r.course_id = $2
        ORDER BY cu.unit_index, r.created_at DESC`,
      [req.user.id, course.id]
    );
    const reviewOptionResult = await query(
      `SELECT e.id AS endorsement_id, e.kind, e.name, e.church,
              (e.endorser_user_id IS NOT NULL) AS is_linked
         FROM endorsements e
        WHERE e.user_id = $1
          AND e.state = 'verified'
          AND e.endorser_user_id IS DISTINCT FROM $1
        ORDER BY (e.endorser_user_id IS NOT NULL) DESC, e.created_at ASC`,
      [req.user.id]
    );
    reviewOptions = reviewOptionResult.rows;
    progress = progress
      ? {
          ...progress,
          latest_exam: latestExam ?? null,
          pastor_review: pastorReviews[0] ?? null,
          pastor_reviews: pastorReviews,
        }
      : progress;
  }
  res.json({ course, units: unitsWithReadings, progress, attempts, review_options: reviewOptions });
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
export function createCourseUnitSubmitHandler({ db = { one, tx } } = {}) {
  return async (req, res) => {
  const { readConfirmed = false } = req.body ?? {};
  if (readConfirmed !== true) return res.status(400).json({ error: '请先阅读本单元文本，再确认已阅读' });
  const course = await db.one('SELECT id, slug FROM courses WHERE slug = $1', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const unit = await db.one(
    'SELECT id, unit_index, is_pastor_node FROM course_units WHERE course_id = $1 AND unit_index = $2',
    [course.id, Number(req.params.index)]
  );
  if (!unit) return res.status(404).json({ error: '单元不存在' });

  const out = await db.tx(async (transaction) => {
    await transaction.query(
      `INSERT INTO course_progress (user_id, course_id, state, units_done)
       VALUES ($1, $2, 'in_progress', 0)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user.id, course.id]
    );

    const progressResult = await transaction.query(
      `SELECT state, pastor_confirmed
         FROM course_progress
        WHERE user_id = $1 AND course_id = $2
        FOR UPDATE`,
      [req.user.id, course.id]
    );
    const currentProgress = progressResult.rows[0];
    if (currentProgress?.state === 'completed') {
      const [done, total] = await Promise.all([
        transaction.query(
          `SELECT count(*)::int AS n FROM unit_attempts a
             JOIN course_units cu ON cu.id = a.unit_id
            WHERE a.user_id = $1 AND cu.course_id = $2 AND a.passed = TRUE`,
          [req.user.id, course.id]
        ),
        transaction.query('SELECT count(*)::int AS n FROM course_units WHERE course_id = $1', [course.id]),
      ]);
      const unitsDone = done.rows[0]?.n ?? 0;
      const totalUnits = total.rows[0]?.n ?? 0;
      return {
        unitsDone,
        totalUnits,
        state: 'completed',
        examReady: true,
        isPastorNode: unit.is_pastor_node,
      };
    }

    const nodeRows = await transaction.query(
      `SELECT id, unit_index
         FROM course_units
        WHERE course_id = $1 AND is_pastor_node = TRUE
        ORDER BY unit_index`,
      [course.id]
    );
    const firstPastorNode = nodeRows.rows[0];
    if (firstPastorNode && Number(unit.unit_index) > Number(firstPastorNode.unit_index)) {
      const midtermApproval = await transaction.query(
        `SELECT 1
           FROM course_pastor_reviews
          WHERE user_id = $1 AND course_id = $2 AND unit_id = $3 AND state = 'approved'
          LIMIT 1`,
        [req.user.id, course.id, firstPastorNode.id]
      );
      if (!midtermApproval.rows[0]) return { blockedByMidterm: true };
    }

    const textbookBindingIssue = await getCourseRequiredTextbookBindingIssue(transaction, {
      courseSlug: course.slug,
      unitId: unit.id,
    });
    if (textbookBindingIssue) return { textbookBindingIssue };

    const incompleteReadings = await incompleteRequiredReadings(transaction, { unitId: unit.id, userId: req.user.id });
    if (incompleteReadings.length > 0) {
      return { blockedByReadings: true, incompleteReadings };
    }

    await transaction.query(
      `INSERT INTO unit_attempts (user_id, unit_id, passed, score, qa_log)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, unit_id) DO UPDATE SET passed = $3, score = $4, qa_log = $5`,
      [req.user.id, unit.id, true, 1, JSON.stringify([{ type: 'reading', readConfirmed: true }])]
    );
    // 统计已阅读单元数
    const done = await transaction.query(
      `SELECT count(*)::int AS n FROM unit_attempts a
         JOIN course_units cu ON cu.id = a.unit_id
        WHERE a.user_id = $1 AND cu.course_id = $2 AND a.passed = TRUE`,
      [req.user.id, course.id]
    );
    const unitsDone = done.rows[0].n;
    const total = await transaction.query('SELECT count(*)::int AS n FROM course_units WHERE course_id = $1', [course.id]);
    const totalUnits = total.rows[0].n;
    const state = nodeRows.rows.length > 0
      ? computeCourseState({
        currentState: currentProgress?.state,
        unitsDone,
        totalUnits,
        pastorConfirmed: currentProgress?.pastor_confirmed ?? 0,
        pastorNodeCount: nodeRows.rows.length,
        pastorNodeIndexes: nodeRows.rows.map((row) => row.unit_index),
        examPassed: false,
      })
      : 'in_progress';

    await transaction.query(
      `UPDATE course_progress SET units_done = $3, state = $4::course_state,
         updated_at = now()
       WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, course.id, unitsDone, state]
    );
    return { unitsDone, totalUnits, state, examReady: unitsDone >= totalUnits, isPastorNode: unit.is_pastor_node };
  });
  if (out.blockedByReadings) {
    return res.status(409).json({
      error: '请先读完本单元绑定教材章节',
      readings: out.incompleteReadings,
    });
  }
  if (out.textbookBindingIssue) {
    return res.status(503).json({
      error: out.textbookBindingIssue.error,
      code: 'COURSE_TEXTBOOK_BINDING_MISSING',
      textbook: {
        slug: out.textbookBindingIssue.textbookSlug,
        title: out.textbookBindingIssue.textbookTitle,
      },
    });
  }
  if (out.blockedByMidterm) {
    return res.status(409).json({ error: '期中牧者确认通过后才能继续第 6 至 10 单元' });
  }
  res.json({ ok: true, ...out });
  };
}

router.post('/courses/:slug/units/:index/submit', requireAuth, createCourseUnitSubmitHandler());

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

export function createCourseExamSubmitHandler({ db = { one, tx } } = {}) {
  return async (req, res) => {
  const course = await db.one('SELECT id, slug FROM courses WHERE slug = $1 AND is_published = TRUE', [req.params.slug]);
  if (!course) return res.status(404).json({ error: '课程不存在' });

  let graded;
  try {
    graded = gradeCourseExam(course.slug, req.body?.answers);
  } catch {
    return res.status(404).json({ error: '课程考试不存在' });
  }

  const out = await db.tx(async (transaction) => {
    await transaction.query(
      `INSERT INTO course_progress (user_id, course_id, state, units_done)
       VALUES ($1, $2, 'in_progress', 0)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user.id, course.id]
    );
    const progress = await transaction.query(
      `SELECT state
         FROM course_progress
        WHERE user_id = $1 AND course_id = $2
        FOR UPDATE`,
      [req.user.id, course.id]
    );
    const total = await transaction.query('SELECT count(*)::int AS n FROM course_units WHERE course_id = $1', [course.id]);
    const totalUnits = total.rows[0].n;
    const done = await transaction.query(
      `SELECT count(*)::int AS n FROM unit_attempts a
         JOIN course_units cu ON cu.id = a.unit_id
        WHERE a.user_id = $1 AND cu.course_id = $2 AND a.passed = TRUE`,
      [req.user.id, course.id]
    );
    const unitsDone = done.rows[0].n;
    if (progress.rows[0]?.state === 'completed') {
      const passedAttempt = await transaction.query(
        `SELECT score
           FROM course_exam_attempts
          WHERE user_id = $1 AND course_id = $2 AND passed = TRUE
          ORDER BY created_at DESC
          LIMIT 1`,
        [req.user.id, course.id]
      );
      return {
        blocked: false,
        unitsDone,
        totalUnits,
        state: 'completed',
        justCompleted: false,
        examResult: { ...graded, score: passedAttempt.rows[0]?.score ?? graded.passThreshold, passed: true },
      };
    }
    if (unitsDone < totalUnits) return { blocked: true, unitsDone, totalUnits };

    await transaction.query(
      `INSERT INTO course_exam_attempts (user_id, course_id, score, passed, answers)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, course.id, graded.score, graded.passed, JSON.stringify(req.body?.answers ?? [])]
    );

    if (!graded.passed) return { blocked: false, unitsDone, totalUnits, state: 'in_progress', justCompleted: false };
    const completion = await applyCourseCompletion(transaction, {
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
  res.json({ ok: true, ...(out.examResult ?? graded), unitsDone: out.unitsDone, totalUnits: out.totalUnits, state: out.state, justCompleted: out.justCompleted });
  };
}

router.post('/courses/:slug/exam/submit', requireAuth, createCourseExamSubmitHandler());

export function createCoursePastorReviewRequestHandler({ db = { one, tx } } = {}) {
  return async (req, res) => {
  const course = await db.one(
    'SELECT id, slug, title FROM courses WHERE slug = $1 AND is_published = TRUE',
    [req.params.slug]
  );
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const endorsementId = String(req.body?.endorsement_id || '');
  const unitId = String(req.body?.unit_id || '');
  if (!UUID_RE.test(endorsementId)) {
    return res.status(400).json({ error: '请选择一位已通过审核的牧者或引荐人' });
  }
  if (!UUID_RE.test(unitId)) {
    return res.status(400).json({ error: '请选择需要确认的课程节点' });
  }
  const requestedNote = String(req.body?.note || '').trim().slice(0, 1000) || null;

  const out = await db.tx(async (transaction) => {
    const nodeResult = await transaction.query(
      `SELECT id, unit_index, title
         FROM course_units
        WHERE id = $1 AND course_id = $2 AND is_pastor_node = TRUE`,
      [unitId, course.id]
    );
    const node = nodeResult.rows[0];
    if (!node) return { invalidNode: true };

    const progressResult = await transaction.query(
      `SELECT state, units_done FROM course_progress
        WHERE user_id = $1 AND course_id = $2
        FOR UPDATE`,
      [req.user.id, course.id]
    );
    const nodes = await transaction.query(
      `SELECT id, unit_index
         FROM course_units
        WHERE course_id = $1 AND is_pastor_node = TRUE
        ORDER BY unit_index`,
      [course.id]
    );
    const firstPastorNode = nodes.rows[0];
    const total = await transaction.query(
      'SELECT count(*)::int AS n FROM course_units WHERE course_id = $1',
      [course.id]
    );
    const midtermApproval = firstPastorNode
      ? await transaction.query(
        `SELECT 1 FROM course_pastor_reviews
          WHERE user_id = $1 AND course_id = $2 AND unit_id = $3 AND state = 'approved'
          LIMIT 1`,
        [req.user.id, course.id, firstPastorNode.id]
      )
      : { rows: [] };
    const passedExam = await transaction.query(
      `SELECT EXISTS(
         SELECT 1 FROM course_exam_attempts
          WHERE user_id = $1 AND course_id = $2 AND passed = TRUE
       ) AS passed`,
      [req.user.id, course.id]
    );
    if (!canRequestCoursePastorReview({
      progressState: progressResult.rows[0]?.state,
      nodeIndex: node.unit_index,
      firstPastorNodeIndex: firstPastorNode?.unit_index,
      unitsDone: progressResult.rows[0]?.units_done ?? 0,
      totalUnits: total.rows[0]?.n ?? 0,
      midtermApproved: Boolean(midtermApproval.rows[0]),
      examPassed: passedExam.rows[0]?.passed === true,
    })) {
      return { blocked: true, isMidterm: node.id === firstPastorNode?.id };
    }

    const endorsementResult = await transaction.query(
      `SELECT e.id, e.kind, e.name,
              CASE
                WHEN reviewer.id IS NOT NULL
                 AND reviewer.is_banned = FALSE
                 AND reviewer.email_verified = TRUE
                 AND (
                   e.kind = 'referrer'
                   OR (
                     reviewer.role = 'pastor'
                     AND EXISTS (
                       SELECT 1 FROM pastor_certifications cert
                        WHERE cert.user_id = reviewer.id AND cert.state = 'approved'
                     )
                   )
                 )
                THEN reviewer.id
                ELSE NULL
              END AS assigned_reviewer_id
         FROM endorsements e
         LEFT JOIN users reviewer ON reviewer.id = e.endorser_user_id
        WHERE e.id = $1
          AND e.user_id = $2
          AND e.state = 'verified'
          AND e.endorser_user_id IS DISTINCT FROM $2`,
      [endorsementId, req.user.id]
    );
    const endorsement = endorsementResult.rows[0];
    if (!endorsement) return { invalidEndorsement: true };

    if (node.id === firstPastorNode?.id && progressResult.rows[0]?.state === 'in_progress') {
      await transaction.query(
        `UPDATE course_progress
            SET state = 'pastor_review', updated_at = now()
          WHERE user_id = $1 AND course_id = $2
            AND state = 'in_progress' AND units_done >= $3`,
        [req.user.id, course.id, firstPastorNode.unit_index]
      );
    }

    const active = await transaction.query(
      `SELECT id, unit_id, state, endorsement_id, assigned_reviewer_id,
              requested_note, review_note, reviewed_at, created_at
         FROM course_pastor_reviews
        WHERE user_id = $1 AND course_id = $2 AND unit_id = $3
          AND state IN ('pending', 'approved')
        ORDER BY (state = 'approved') DESC, created_at DESC LIMIT 1`,
      [req.user.id, course.id, node.id]
    );
    if (active.rows[0]) return { review: active.rows[0], already: true };

    const inserted = await transaction.query(
      `INSERT INTO course_pastor_reviews
         (user_id, course_id, unit_id, endorsement_id, assigned_reviewer_id, state, requested_note)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       ON CONFLICT (user_id, course_id, unit_id) WHERE state = 'pending' DO NOTHING
       RETURNING id, unit_id, state, endorsement_id, assigned_reviewer_id,
                 requested_note, review_note, reviewed_at, created_at`,
      [req.user.id, course.id, node.id, endorsement.id, endorsement.assigned_reviewer_id, requestedNote]
    );
    if (inserted.rows[0]) return { review: inserted.rows[0], already: false };

    const existing = await transaction.query(
      `SELECT id, unit_id, state, endorsement_id, assigned_reviewer_id,
              requested_note, review_note, reviewed_at, created_at
         FROM course_pastor_reviews
        WHERE user_id = $1 AND course_id = $2 AND unit_id = $3 AND state = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, course.id, node.id]
    );
    return { review: existing.rows[0], already: true };
  });

  if (out.blocked) {
    return res.status(409).json({
      error: out.isMidterm
        ? '第 5 单元完成后可申请期中牧者确认'
        : '第 10 单元完成并通过结课考试后才能申请结业牧者确认',
    });
  }
  if (out.invalidEndorsement) {
    return res.status(400).json({ error: '所选背书不存在、尚未通过审核或不能由本人背书' });
  }
  if (out.invalidNode) {
    return res.status(400).json({ error: '所选课程节点不存在或无需确认' });
  }
  res.status(out.already ? 200 : 201).json({ ok: true, already: out.already, pastorReview: out.review });
  };
}

router.post('/courses/:slug/pastor-review', requireAuth, createCoursePastorReviewRequestHandler());

export default router;
