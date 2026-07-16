import crypto from 'node:crypto';
import { Router } from 'express';

import { query, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { isCertifiedPastor } from '../lib/certified-pastor.js';
import {
  canEditCourse,
  nextPublicationState,
  normalizeCourseDraft,
  serializeCourseMaterial,
  validateCourseSubmission,
} from '../lib/course-authoring.js';
import { writeAdminAudit } from '../lib/admin-audit.js';

const defaultDb = { query };
const PUBLICATION_STATES = new Set(['draft', 'pending_review', 'changes_requested', 'published', 'archived']);

function routeError(status, message, fields) {
  const error = new Error(message);
  error.status = status;
  error.fields = fields;
  return error;
}

function sendRouteError(res, error) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message, ...(error.fields ? { fields: error.fields } : {}) });
  }
  console.error('[course-authoring] 路由失败：', error?.message);
  return res.status(500).json({ error: '课程操作失败' });
}

async function first(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

function emptyDraft() {
  return { title: '', subtitle: null, description: '', cover_image: null, units: [], exam: { pass_threshold: 80, questions: [] } };
}

function storageDraft(input) {
  const draft = normalizeCourseDraft(input);
  if (!Number.isInteger(draft.exam.pass_threshold)
    || draft.exam.pass_threshold < 1 || draft.exam.pass_threshold > 100) {
    draft.exam.pass_threshold = 80;
  }
  return draft;
}

function coursePayload(row) {
  const payload = row.authoring_payload && typeof row.authoring_payload === 'object'
    ? row.authoring_payload
    : emptyDraft();
  return {
    ...row,
    authoring_payload: undefined,
    units: Array.isArray(payload.units) ? payload.units : [],
    exam: payload.exam ?? { pass_threshold: 80, questions: [] },
    author: row.author_id
      ? {
          id: row.author_id,
          email: row.author_email ?? null,
          nickname: row.author_nickname ?? null,
          certification_state: row.author_certification_state ?? null,
        }
      : null,
  };
}

async function getCourse(db, id, { authorId = null } = {}) {
  const params = [id];
  const authorFilter = authorId ? ' AND c.author_id = $2' : '';
  if (authorId) params.push(authorId);
  const course = await first(
    db,
    `SELECT c.id, c.slug, c.title, c.subtitle, c.description, c.cover_image,
            c.sort_order, c.created_at, c.updated_at, c.author_id, c.publication_state,
            c.rewards_enabled, c.review_note, c.reviewed_by, c.reviewed_at,
            c.submitted_at, c.published_at, c.is_published, c.authoring_payload,
            u.email AS author_email, p.nickname AS author_nickname,
            u.role AS author_role,
            pc.state AS author_certification_state
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       LEFT JOIN profiles p ON p.user_id = c.author_id
       LEFT JOIN LATERAL (
         SELECT state FROM pastor_certifications
          WHERE user_id = c.author_id
          ORDER BY created_at DESC LIMIT 1
       ) pc ON TRUE
      WHERE c.id = $1${authorFilter}`,
    params,
  );
  if (!course) return null;
  if (!course.authoring_payload || Object.keys(course.authoring_payload).length === 0) {
    const { rows: units } = await db.query(
      `SELECT id, unit_index, title, material, is_pastor_node
         FROM course_units WHERE course_id = $1 ORDER BY unit_index`,
      [id],
    );
    const exam = await first(db, 'SELECT id, pass_threshold FROM course_exams WHERE course_id = $1', [id]);
    const questions = exam
      ? (await db.query(
          `SELECT id, question_key, question_index, prompt, options, correct_option, explanation
             FROM course_exam_questions WHERE exam_id = $1 ORDER BY question_index`,
          [exam.id],
        )).rows
      : [];
    course.authoring_payload = {
      title: course.title ?? '',
      subtitle: course.subtitle ?? null,
      description: course.description ?? '',
      cover_image: course.cover_image ?? null,
      units,
      exam: { pass_threshold: exam?.pass_threshold ?? 80, questions },
    };
  }
  return coursePayload(course);
}

async function isCertifiedAuthor(db, userId) {
  const user = await first(
    db,
    `SELECT u.id, u.email_verified, u.is_banned, u.role,
            EXISTS (
              SELECT 1 FROM pastor_certifications pc
               WHERE pc.user_id = u.id AND pc.state = 'approved'
            ) AS has_approved_certification
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  return Boolean(user && isCertifiedPastor(user));
}

function requireCourseAuthor({ certifyUser = isCertifiedAuthor, db }) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'pastor' || !(await certifyUser(db, req.user.id))) {
      return res.status(403).json({ error: '只有认证牧者或管理员可以编写课程' });
    }
    return next();
  };
}

async function replaceRelationalContent(db, courseId, draft) {
  await db.query('DELETE FROM course_units WHERE course_id = $1', [courseId]);
  for (const unit of draft.units) {
    await db.query(
      `INSERT INTO course_units (course_id, unit_index, title, material, is_pastor_node)
       VALUES ($1, $2, $3, $4, $5)`,
      [courseId, unit.unit_index, unit.title || '未命名单元', serializeCourseMaterial(unit.material), unit.is_pastor_node],
    );
  }

  await db.query(
    `DELETE FROM course_exam_questions
      WHERE exam_id IN (SELECT id FROM course_exams WHERE course_id = $1)`,
    [courseId],
  );
  await db.query('DELETE FROM course_exams WHERE course_id = $1', [courseId]);
  const exam = await first(
    db,
    `INSERT INTO course_exams (course_id, pass_threshold)
     VALUES ($1, $2) RETURNING id`,
    [courseId, draft.exam.pass_threshold],
  );
  for (const [index, question] of draft.exam.questions.entries()) {
    const options = Array.isArray(question.options) ? question.options : [];
    const correctOption = Number(question.correct_option);
    if (!question.prompt || options.length < 2 || options.length > 6 || options.some((option) => !option)
      || !Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length) continue;
    await db.query(
      `INSERT INTO course_exam_questions
         (exam_id, question_key, question_index, prompt, options, correct_option, explanation)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [exam.id, question.question_key || `${courseId}-${index + 1}`, index + 1, question.prompt,
        JSON.stringify(options), correctOption, question.explanation || null],
    );
  }
}

async function authorCourse(req, db) {
  const authorId = req.user.role === 'admin' ? null : req.user.id;
  return getCourse(db, req.params.id, { authorId });
}

export function createCourseAuthoringRouter({
  db = defaultDb,
  transaction = tx,
  certifyUser = isCertifiedAuthor,
} = {}) {
  const router = Router();
  const requireAuthor = requireCourseAuthor({ db, certifyUser });

  router.get('/pastor/courses', requireAuthor, async (req, res) => {
    const authorFilter = req.user.role === 'admin' ? '' : 'WHERE c.author_id = $1';
    const params = req.user.role === 'admin' ? [] : [req.user.id];
    const { rows } = await db.query(
      `SELECT c.id, c.slug, c.title, c.description, c.publication_state, c.review_note,
              c.author_id, c.rewards_enabled, c.submitted_at, c.published_at,
              c.created_at, c.updated_at
         FROM courses c ${authorFilter}
        ORDER BY c.updated_at DESC, c.created_at DESC`,
      params,
    );
    return res.json({ courses: rows });
  });

  router.post('/pastor/courses', requireAuthor, async (req, res) => {
    const draft = storageDraft(req.body ?? {});
    const slug = `pastor-course-${crypto.randomUUID().slice(0, 12)}`;
    const course = await first(
      db,
      `INSERT INTO courses
         (author_id, slug, title, subtitle, description, cover_image,
          is_published, publication_state, rewards_enabled, authoring_payload)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, 'draft', FALSE, $7::jsonb)
       RETURNING id, slug, title, subtitle, description, cover_image, is_published,
                 publication_state, rewards_enabled, author_id, authoring_payload,
                 created_at, updated_at`,
      [req.user.id, slug, draft.title || '未命名课程', draft.subtitle, draft.description || null,
        draft.cover_image, JSON.stringify(draft)],
    );
    return res.status(201).json({ course: coursePayload(course) });
  });

  router.get('/pastor/courses/:id', requireAuthor, async (req, res) => {
    const course = await authorCourse(req, db);
    if (!course) return res.status(404).json({ error: '课程不存在' });
    return res.json({ course });
  });

  router.put('/pastor/courses/:id', requireAuthor, async (req, res) => {
    const course = await authorCourse(req, db);
    if (!course) return res.status(404).json({ error: '课程不存在' });
    if (!canEditCourse(req.user, course)) return res.status(409).json({ error: '当前状态不可编辑' });

    const draft = storageDraft(req.body ?? {});
    try {
      await transaction(async (connection) => {
        await connection.query(
          `UPDATE courses
              SET title = $2, subtitle = $3, description = $4, cover_image = $5,
                  authoring_payload = $6::jsonb, updated_at = now()
            WHERE id = $1`,
          [req.params.id, draft.title || '未命名课程', draft.subtitle, draft.description || null,
            draft.cover_image, JSON.stringify(draft)],
        );
        await replaceRelationalContent(connection, req.params.id, draft);
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
    const saved = await authorCourse(req, db);
    return res.json({ course: saved });
  });

  router.post('/pastor/courses/:id/submit', requireAuthor, async (req, res) => {
    const course = await authorCourse(req, db);
    if (!course) return res.status(404).json({ error: '课程不存在' });
    if (!canEditCourse(req.user, course)) return res.status(409).json({ error: '当前状态不可提交审核' });

    const draft = storageDraft({
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      cover_image: course.cover_image,
      units: course.units,
      exam: course.exam,
    });
    const fields = validateCourseSubmission(draft);
    if (Object.keys(fields).length > 0) {
      return res.status(400).json({ error: '课程内容不完整，无法提交审核', fields });
    }

    try {
      const submitted = await transaction(async (connection) => {
        await replaceRelationalContent(connection, req.params.id, draft);
        const result = await connection.query(
          `UPDATE courses
              SET publication_state = 'pending_review'::course_publication_state,
                  is_published = FALSE, submitted_at = now(), reviewed_by = NULL,
                  reviewed_at = NULL, review_note = NULL, authoring_payload = $3::jsonb,
                  updated_at = now()
            WHERE id = $1 AND author_id = $2
              AND publication_state IN ('draft', 'changes_requested')
            RETURNING id`,
          [req.params.id, req.user.id, JSON.stringify(draft)],
        );
        if (!result.rows[0]) throw routeError(409, '课程状态已变化，请刷新后重试');
        return result.rows[0];
      });
      const saved = await authorCourse(req, db);
      return res.json({ course: saved ?? submitted });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  const requireAdmin = [requireAuth, requireRole('admin')];

  router.get('/admin/course-submissions', ...requireAdmin, async (req, res) => {
    const state = String(req.query.state ?? 'pending_review');
    if (!PUBLICATION_STATES.has(state)) return res.status(400).json({ error: '非法课程状态' });
    const { rows } = await db.query(
      `SELECT c.id, c.slug, c.title, c.description, c.publication_state, c.review_note,
              c.author_id, c.submitted_at, c.published_at, c.created_at, c.updated_at,
              u.email AS author_email, p.nickname AS author_nickname,
              pc.state AS author_certification_state
         FROM courses c
         LEFT JOIN users u ON u.id = c.author_id
         LEFT JOIN profiles p ON p.user_id = c.author_id
         LEFT JOIN LATERAL (
           SELECT state FROM pastor_certifications
            WHERE user_id = c.author_id
            ORDER BY created_at DESC LIMIT 1
         ) pc ON TRUE
        WHERE c.publication_state = $1
        ORDER BY c.submitted_at ASC NULLS LAST, c.updated_at ASC`,
      [state],
    );
    return res.json({ courses: rows });
  });

  router.get('/admin/course-submissions/:id', ...requireAdmin, async (req, res) => {
    const course = await getCourse(db, req.params.id);
    if (!course) return res.status(404).json({ error: '课程不存在' });
    return res.json({ course });
  });

  router.patch('/admin/course-submissions/:id', ...requireAdmin, async (req, res) => {
    const { action: requestedAction, note = '', expected_state: expectedState } = req.body ?? {};
    const action = { approve: 'publish', reject: 'request_changes' }[requestedAction] ?? requestedAction;
    if (!['publish', 'request_changes', 'archive'].includes(action)) {
      return res.status(400).json({ error: 'action 须为 publish、request_changes 或 archive' });
    }
    if (action === 'request_changes' && !String(note).trim()) {
      return res.status(400).json({ error: '退回修改必须填写审核意见' });
    }

    try {
      const updated = await transaction(async (connection) => {
        const current = await first(
          connection,
          `SELECT c.id, c.author_id, c.publication_state, u.role AS author_role,
                  u.email_verified, u.is_banned,
                  EXISTS (
                    SELECT 1 FROM pastor_certifications pc
                     WHERE pc.user_id = c.author_id AND pc.state = 'approved'
                  ) AS has_approved_certification
             FROM courses c LEFT JOIN users u ON u.id = c.author_id
            WHERE c.id = $1 FOR UPDATE`,
          [req.params.id],
        );
        if (!current) throw routeError(404, '课程不存在');
        if (expectedState && current.publication_state !== expectedState) {
          throw routeError(409, '课程状态已变化，请刷新后重试');
        }
        const expected = expectedState || current.publication_state;
        if (action === 'request_changes' && expected !== 'pending_review') {
          throw routeError(409, '只有待审核课程可以退回修改');
        }
        if (action === 'publish' && expected !== 'pending_review') {
          throw routeError(409, '只有待审核课程可以发布');
        }
        if (action === 'archive' && !['pending_review', 'published'].includes(expected)) {
          throw routeError(409, '当前课程状态不可归档');
        }
        if (action === 'publish' && current.author_role !== 'admin'
          && !(current.email_verified && !current.is_banned && current.author_role === 'pastor'
            && current.has_approved_certification)) {
          throw routeError(403, '课程作者的牧者认证已失效');
        }

        const nextState = nextPublicationState(expected, action === 'publish' ? 'approve' : action);
        const result = await connection.query(
          `UPDATE courses
              SET publication_state = $2::course_publication_state,
                  is_published = ($2 = 'published'),
                  review_note = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now()
            WHERE id = $1 AND publication_state = $5::course_publication_state
            RETURNING id, publication_state, is_published`,
          [req.params.id, nextState, action === 'request_changes' ? String(note).trim() : null,
            req.user.id, expected],
        );
        if (!result.rows[0]) throw routeError(409, '课程状态已变化，请刷新后重试');
        await writeAdminAudit(connection, {
          actorId: req.user.id,
          action: `course.${action}`,
          targetType: 'course',
          targetId: req.params.id,
          detail: { from: expected, to: nextState, note: action === 'request_changes' ? String(note).trim() : undefined },
        });
        return result.rows[0];
      });
      const course = await getCourse(db, updated.id);
      return res.json({ course: course ?? updated });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  return router;
}

export default createCourseAuthoringRouter();
