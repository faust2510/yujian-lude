import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

import { createCourseAuthoringRouter } from './course-authoring.routes.js';

function validDraft() {
  return {
    title: '盟约沟通',
    description: '帮助信徒学习在真实关系中沟通、倾听与修复冲突。',
    units: [{ unit_index: 1, title: '倾听', material: '学习如何在冲突中倾听。', is_pastor_node: false }],
    exam: {
      pass_threshold: 80,
      questions: [1, 2, 3].map((index) => ({
        question_index: index,
        prompt: `问题 ${index}`,
        options: ['选项甲', '选项乙'],
        correct_option: 0,
      })),
    },
  };
}

function makeDb() {
  return {
    rows: [],
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      if (/INSERT INTO courses/.test(sql)) {
        const course = {
          id: 'course-1',
          slug: 'course-1',
          title: '未命名课程',
          description: null,
          publication_state: 'draft',
          is_published: false,
          author_id: params[0],
          rewards_enabled: false,
          authoring_payload: {},
        };
        this.rows = [course];
        return { rows: [course] };
      }
      if (/UPDATE courses/.test(sql)) {
        const course = this.rows[0];
        if (course && /authoring_payload/.test(sql)) {
          course.authoring_payload = JSON.parse(params.at(-1));
          course.title = params[1];
          course.description = params[3];
        }
        if (course && /SET publication_state = \$2/.test(sql)) course.publication_state = params[1];
        return { rows: /RETURNING/.test(sql) ? [course] : [] };
      }
      if (/FROM courses/.test(sql) && /WHERE c\.id = \$1/.test(sql)) {
        return { rows: params[1] && this.rows[0]?.author_id !== params[1] ? [] : this.rows };
      }
      if (/FROM courses/.test(sql)) return { rows: this.rows };
      if (/INSERT INTO course_exams/.test(sql)) return { rows: [{ id: 'exam-1' }] };
      return { rows: [] };
    },
  };
}

function makeApp({ user, db = makeDb(), certifyUser = true } = {}) {
  const app = express();
  app.use(express.json());
  if (user) app.use((req, _res, next) => { req.user = user; next(); });
  app.use(createCourseAuthoringRouter({
    db,
    transaction: async (callback) => callback(db),
    certifyUser: async () => certifyUser,
  }));
  return { app, db };
}

async function request(app, method, path, body) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('course authoring routes require authentication and certified pastor access', async () => {
  const anonymous = await request(makeApp().app, 'GET', '/pastor/courses');
  assert.equal(anonymous.status, 401);

  const unverified = await request(
    makeApp({ user: { id: 'pastor-1', role: 'pastor' }, certifyUser: false }).app,
    'POST',
    '/pastor/courses',
  );
  assert.equal(unverified.status, 403);
});

test('certified pastor creates a draft and invalid content can be saved but not submitted', async () => {
  const { app, db } = makeApp({ user: { id: 'pastor-1', role: 'pastor' } });
  const created = await request(app, 'POST', '/pastor/courses');
  assert.equal(created.status, 201);
  assert.equal(created.body.course.publication_state, 'draft');
  assert.equal(created.body.course.rewards_enabled, false);

  const invalid = await request(app, 'PUT', '/pastor/courses/course-1', {
    ...validDraft(),
    title: '',
    exam: { pass_threshold: 80, questions: [] },
  });
  assert.equal(invalid.status, 200);
  assert.match(db.queries.map(({ sql }) => sql).join('\n'), /authoring_payload/);

  const submitted = await request(app, 'POST', '/pastor/courses/course-1/submit');
  assert.equal(submitted.status, 400);
  assert.ok(submitted.body.fields);
});

test('author cannot read another pastor draft', async () => {
  const db = makeDb();
  db.rows = [{ id: 'course-2', author_id: 'pastor-2', publication_state: 'draft' }];
  const response = await request(
    makeApp({ user: { id: 'pastor-1', role: 'pastor' }, db }).app,
    'GET',
    '/pastor/courses/course-2',
  );
  assert.equal(response.status, 404);
});

test('admin review requires a note for return and uses the expected state for compare-and-swap', async () => {
  const db = makeDb();
  db.rows = [{
    id: 'course-1',
    author_id: 'pastor-1',
    publication_state: 'pending_review',
    is_published: false,
    authoring_payload: validDraft(),
  }];
  const { app } = makeApp({ user: { id: 'admin-1', role: 'admin' }, db });

  const missingNote = await request(app, 'PATCH', '/admin/course-submissions/course-1', {
    action: 'request_changes',
    expected_state: 'pending_review',
  });
  assert.equal(missingNote.status, 400);

  const returned = await request(app, 'PATCH', '/admin/course-submissions/course-1', {
    action: 'request_changes',
    note: '请补充单元正文。',
    expected_state: 'pending_review',
  });
  assert.notEqual(returned.status, 500);
});

test('admin can publish a reviewed course and archive it later', async () => {
  const db = makeDb();
  db.rows = [{
    id: 'course-1',
    author_id: 'pastor-1',
    author_role: 'pastor',
    email_verified: true,
    is_banned: false,
    has_approved_certification: true,
    publication_state: 'pending_review',
    is_published: false,
    authoring_payload: validDraft(),
  }];
  const { app } = makeApp({ user: { id: 'admin-1', role: 'admin' }, db });

  const published = await request(app, 'PATCH', '/admin/course-submissions/course-1', {
    action: 'approve',
    expected_state: 'pending_review',
  });
  assert.equal(published.status, 200);
  assert.equal(published.body.course.publication_state, 'published');

  const archived = await request(app, 'PATCH', '/admin/course-submissions/course-1', {
    action: 'archive',
    expected_state: 'published',
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.course.publication_state, 'archived');
});
