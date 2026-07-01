import test from 'node:test';
import assert from 'node:assert/strict';

import { courseExamAnswers, gradeCourseExam, publicCourseExam } from './course-exams.js';

test('course exams expose questions without answers', () => {
  const exam = publicCourseExam('christian-dating-basics');

  assert.equal(exam.total, 4);
  assert.equal(exam.passThreshold, 3);
  assert.equal(exam.questions.length, 4);
  assert.equal(exam.questions[0].answer, undefined);
  assert.ok(exam.questions[0].options.A);
});

test('course exam grading accepts correct answers and rejects weak answers', () => {
  const answers = courseExamAnswers('christian-dating-basics');
  const passed = gradeCourseExam('christian-dating-basics', answers);
  const failed = gradeCourseExam('christian-dating-basics', answers.map((item) => ({ ...item, a: 'A' })));

  assert.equal(passed.passed, true);
  assert.equal(passed.score, 4);
  assert.equal(failed.passed, false);
  assert.ok(failed.score < failed.passThreshold);
});

test('unknown course exams fail closed', () => {
  assert.throws(
    () => publicCourseExam('missing-course'),
    /课程考试不存在/
  );
});
