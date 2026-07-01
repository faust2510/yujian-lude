import test from 'node:test';
import assert from 'node:assert/strict';

import { courseExamAnswers, gradeCourseExam, publicCourseExam } from './course-exams.js';

test('course exams expose questions without answers', () => {
  const exam = publicCourseExam('christian-dating-basics');

  assert.equal(exam.total, 8);
  assert.equal(exam.passThreshold, 6);
  assert.equal(exam.questions.length, 8);
  assert.equal(exam.questions[0].answer, undefined);
  assert.ok(exam.questions[0].options.A);
});

test('course exam grading accepts correct answers and rejects weak answers', () => {
  const answers = courseExamAnswers('christian-dating-basics');
  const passed = gradeCourseExam('christian-dating-basics', answers);
  const failed = gradeCourseExam('christian-dating-basics', answers.map((item) => ({ ...item, a: 'A' })));

  assert.equal(passed.passed, true);
  assert.equal(passed.score, 8);
  assert.equal(failed.passed, false);
  assert.ok(failed.score < failed.passThreshold);
});

test('marriage course exam is deep enough for a flagship course', () => {
  const exam = publicCourseExam('keller-meaning-of-marriage');
  const answers = courseExamAnswers('keller-meaning-of-marriage');
  const topics = exam.questions.map((question) => `${question.q} ${Object.values(question.options).join(' ')}`).join('\n');

  assert.equal(exam.total, 10);
  assert.equal(exam.passThreshold, 8);
  assert.equal(answers.length, 10);
  assert.match(topics, /盟约/);
  assert.match(topics, /冲突|悔改/);
  assert.match(topics, /单身/);
  assert.match(topics, /身体|亲密/);
});

test('unknown course exams fail closed', () => {
  assert.throws(
    () => publicCourseExam('missing-course'),
    /课程考试不存在/
  );
});
