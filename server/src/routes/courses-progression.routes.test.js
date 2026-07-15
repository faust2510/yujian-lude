import 'express-async-errors';
import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import * as courseRoutes from './courses.routes.js';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const MIDTERM_ID = '22222222-2222-4222-8222-222222222222';
const FINAL_ID = '33333333-3333-4333-8333-333333333333';
const ENDORSEMENT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

async function request(handler, path, body) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: USER_ID, role: 'free', is_banned: false };
    next();
  });
  const routePath = path.endsWith('/pastor-review')
    ? '/courses/:slug/pastor-review'
    : path.endsWith('/exam/submit')
      ? '/courses/:slug/exam/submit'
      : '/courses/:slug/units/:index/submit';
  app.post(routePath, handler);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function unitRouteDb({
  progressState = 'in_progress',
  unitsDone = 5,
  unitIndex = 5,
  midtermApproved = false,
  expectedBindings = 1,
  incompleteReadings = [],
} = {}) {
  const progress = {
    state: progressState,
    units_done: unitsDone,
    completed_at: progressState === 'completed' ? '2026-07-01T00:00:00.000Z' : null,
    badge_awarded: progressState === 'completed',
    reward_count: progressState === 'completed' ? 1 : 0,
    pastor_confirmed: progressState === 'completed' ? 2 : 0,
  };
  const calls = [];
  const transaction = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO course_progress/.test(sql)) return { rows: [] };
      if (/FROM course_units\s+WHERE course_id = \$1 AND is_pastor_node/.test(sql)) {
        return { rows: [{ id: MIDTERM_ID, unit_index: 5 }, { id: FINAL_ID, unit_index: 10 }] };
      }
      if (/SELECT state, pastor_confirmed\s+FROM course_progress/.test(sql)) {
        return { rows: [{ state: progress.state, pastor_confirmed: midtermApproved ? 1 : progress.pastor_confirmed }] };
      }
      if (/FROM course_pastor_reviews/.test(sql) && /state = 'approved'/.test(sql)) {
        return { rows: midtermApproved ? [{ '?column?': 1 }] : [] };
      }
      if (/expected_required_bindings/.test(sql)) return { rows: [{ expected_required_bindings: expectedBindings }] };
      if (/COALESCE\(trp\.completed, FALSE\) = FALSE/.test(sql)) return { rows: incompleteReadings };
      if (/INSERT INTO unit_attempts/.test(sql)) return { rows: [] };
      if (/FROM unit_attempts a/.test(sql)) return { rows: [{ n: unitsDone }] };
      if (/count\(\*\)::int AS n FROM course_units/.test(sql)) return { rows: [{ n: 10 }] };
      if (/UPDATE course_progress SET units_done/.test(sql)) {
        progress.units_done = params[2];
        progress.state = params[3];
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return {
    progress,
    calls,
    async one(sql) {
      if (/FROM courses/.test(sql)) return { id: COURSE_ID, slug: 'keller-meaning-of-marriage' };
      if (/FROM course_units/.test(sql)) {
        return { id: unitIndex === 5 ? MIDTERM_ID : FINAL_ID, unit_index: unitIndex, is_pastor_node: unitIndex === 5 };
      }
      return null;
    },
    async tx(callback) { return callback(transaction); },
  };
}

function examRouteDb({ progressState = 'completed', unitsDone = 10 } = {}) {
  const calls = [];
  const transaction = {
    async query(sql) {
      calls.push(sql);
      if (/INSERT INTO course_progress/.test(sql)) return { rows: [] };
      if (/SELECT state\s+FROM course_progress/.test(sql)) return { rows: [{ state: progressState }] };
      if (/FROM course_exam_attempts/.test(sql) && /passed = TRUE/.test(sql)) return { rows: [{ score: 8 }] };
      if (/count\(\*\)::int AS n FROM course_units/.test(sql)) return { rows: [{ n: 10 }] };
      if (/FROM unit_attempts a/.test(sql)) return { rows: [{ n: unitsDone }] };
      return { rows: [] };
    },
  };
  return {
    calls,
    async one(sql) {
      if (/FROM courses/.test(sql)) return { id: COURSE_ID, slug: 'keller-meaning-of-marriage' };
      return null;
    },
    async tx(callback) { return callback(transaction); },
  };
}

function reviewRouteDb() {
  const progress = { state: 'in_progress', units_done: 5 };
  const transaction = {
    async query(sql, params) {
      if (/WHERE id = \$1 AND course_id = \$2 AND is_pastor_node/.test(sql)) {
        return { rows: [{ id: MIDTERM_ID, unit_index: 5, title: '期中节点' }] };
      }
      if (/SELECT state, units_done FROM course_progress/.test(sql)) {
        return { rows: [{ ...progress }] };
      }
      if (/FROM course_units\s+WHERE course_id = \$1 AND is_pastor_node/.test(sql)) {
        return { rows: [{ id: MIDTERM_ID, unit_index: 5 }, { id: FINAL_ID, unit_index: 10 }] };
      }
      if (/count\(\*\)::int AS n FROM course_units/.test(sql)) return { rows: [{ n: 10 }] };
      if (/SELECT EXISTS\(/.test(sql)) return { rows: [{ passed: false }] };
      if (/FROM endorsements e/.test(sql)) {
        return { rows: [{ id: ENDORSEMENT_ID, kind: 'pastor', name: '测试牧者', assigned_reviewer_id: null }] };
      }
      if (/state IN \('pending', 'approved'\)/.test(sql)) return { rows: [] };
      if (/INSERT INTO course_pastor_reviews/.test(sql)) {
        return { rows: [{ id: '66666666-6666-4666-8666-666666666666', unit_id: MIDTERM_ID, state: 'pending' }] };
      }
      if (/UPDATE course_progress\s+SET state = 'pastor_review'/.test(sql)) {
        progress.state = 'pastor_review';
        return { rows: [{ state: progress.state, params }] };
      }
      return { rows: [] };
    },
  };
  return {
    progress,
    async one() { return { id: COURSE_ID, slug: 'keller-meaning-of-marriage', title: '婚姻的意义' }; },
    async tx(callback) { return callback(transaction); },
  };
}

function unitHandler(db) {
  assert.equal(typeof courseRoutes.createCourseUnitSubmitHandler, 'function', 'course unit route must expose an injectable handler');
  return courseRoutes.createCourseUnitSubmitHandler({ db });
}

function reviewHandler(db) {
  assert.equal(typeof courseRoutes.createCoursePastorReviewRequestHandler, 'function', 'course review route must expose an injectable handler');
  return courseRoutes.createCoursePastorReviewRequestHandler({ db });
}

function examHandler(db) {
  assert.equal(typeof courseRoutes.createCourseExamSubmitHandler, 'function', 'course exam route must expose an injectable handler');
  return courseRoutes.createCourseExamSubmitHandler({ db });
}

test('resubmitting a unit cannot downgrade a completed course or touch completion metadata', async () => {
  const db = unitRouteDb({ progressState: 'completed', unitsDone: 10 });
  const before = structuredClone(db.progress);

  const response = await request(unitHandler(db), '/courses/keller-meaning-of-marriage/units/5/submit', { readConfirmed: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.state, 'completed');
  assert.deepEqual(db.progress, before);
  assert.equal(db.calls.some(({ sql }) => /UPDATE course_progress SET units_done/.test(sql)), false);
});

test('a failed exam retake returns the authoritative completed result and does not create a failed latest attempt', async () => {
  const db = examRouteDb();

  const response = await request(
    examHandler(db),
    '/courses/keller-meaning-of-marriage/exam/submit',
    { answers: [] }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.passed, true);
  assert.equal(response.body.score, 8);
  assert.equal(response.body.state, 'completed');
  assert.equal(db.calls.some((sql) => /INSERT INTO course_exam_attempts/.test(sql)), false);
});

test('a failed exam for an unfinished course still records the attempt and remains in progress', async () => {
  const db = examRouteDb({ progressState: 'in_progress' });

  const response = await request(
    examHandler(db),
    '/courses/keller-meaning-of-marriage/exam/submit',
    { answers: [] }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.passed, false);
  assert.equal(response.body.state, 'in_progress');
  assert.equal(db.calls.some((sql) => /INSERT INTO course_exam_attempts/.test(sql)), true);
});

test('legacy in-progress unit-five data can create a midterm review request', async () => {
  const db = reviewRouteDb();
  const response = await request(
    reviewHandler(db),
    '/courses/keller-meaning-of-marriage/pastor-review',
    { unit_id: MIDTERM_ID, endorsement_id: ENDORSEMENT_ID }
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.pastorReview.state, 'pending');
  assert.equal(db.progress.state, 'pastor_review');
});

test('configured deep course returns 503 when its required textbook binding is missing', async () => {
  const response = await request(
    unitHandler(unitRouteDb({ expectedBindings: 0 })),
    '/courses/keller-meaning-of-marriage/units/5/submit',
    { readConfirmed: true }
  );

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'COURSE_TEXTBOOK_BINDING_MISSING');
});

test('configured required but unread textbook chapters return 409', async () => {
  const response = await request(
    unitHandler(unitRouteDb({ incompleteReadings: [{ chapter_title: '第 1 章' }] })),
    '/courses/keller-meaning-of-marriage/units/5/submit',
    { readConfirmed: true }
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /请先读完/);
  assert.equal(response.body.readings.length, 1);
});

test('unit six returns 409 until the midterm pastor review is approved', async () => {
  const response = await request(
    unitHandler(unitRouteDb({ unitIndex: 6 })),
    '/courses/keller-meaning-of-marriage/units/6/submit',
    { readConfirmed: true }
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /期中牧者确认/);
});

test('unit six proceeds after the midterm pastor review is approved', async () => {
  const response = await request(
    unitHandler(unitRouteDb({ unitIndex: 6, unitsDone: 6, midtermApproved: true })),
    '/courses/keller-meaning-of-marriage/units/6/submit',
    { readConfirmed: true }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.unitsDone, 6);
});
