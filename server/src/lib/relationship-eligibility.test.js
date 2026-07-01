import test from 'node:test';
import assert from 'node:assert/strict';

import { hasPassedRequiredCourseExam } from './relationship-eligibility.js';

test('relationship initiation requires a passed exam for the configured course', async () => {
  const calls = [];
  const one = async (sql, params) => {
    calls.push({ sql, params });
    return { ok: 1 };
  };

  const passed = await hasPassedRequiredCourseExam(one, {
    userId: 'user-1',
    requiredCourseId: 'course-light',
  });

  assert.equal(passed, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /course_exam_attempts/);
  assert.match(calls[0].sql, /course_id = \$2/);
  assert.deepEqual(calls[0].params, ['user-1', 'course-light']);
});

test('relationship initiation is blocked when no required course is configured or passed', async () => {
  let called = false;
  const one = async () => {
    called = true;
    return null;
  };

  assert.equal(await hasPassedRequiredCourseExam(one, {
    userId: 'user-1',
    requiredCourseId: '',
  }), false);
  assert.equal(called, false);

  assert.equal(await hasPassedRequiredCourseExam(one, {
    userId: 'user-1',
    requiredCourseId: 'course-light',
  }), false);
  assert.equal(called, true);
});
