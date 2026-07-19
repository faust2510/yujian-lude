import test from 'node:test';
import assert from 'node:assert/strict';

import {
  courseExamAnswers,
  gradeCourseExam,
  gradePersistedCourseExam,
  persistedCourseExamAnswers,
  publicCourseExam,
  publicPersistedCourseExam,
} from './course-exams.js';

test('persisted exam verification answers use database question ids and option indexes', () => {
  assert.deepEqual(persistedCourseExamAnswers([
    { id: 'db-q1', correct_option: 2 },
    { id: 'db-q2', correct_option: 0 },
  ]), [
    { id: 'db-q1', a: 'C' },
    { id: 'db-q2', a: 'A' },
  ]);
});

test('persisted exams expose options without correct answers and grade percentage thresholds', () => {
  const exam = { pass_threshold: 80 };
  const questions = [
    { id: 'q1', prompt: '第一题', options: ['甲', '乙'], correct_option: 1 },
    { id: 'q2', prompt: '第二题', options: ['丙', '丁'], correct_option: 0 },
    { id: 'q3', prompt: '第三题', options: ['戊', '己'], correct_option: 1 },
  ];
  const publicExam = publicPersistedCourseExam(exam, questions);
  const result = gradePersistedCourseExam(exam, questions, [
    { id: 'q1', a: 'B' },
    { id: 'q2', a: 'A' },
    { id: 'q3', a: 'A' },
  ]);

  assert.equal(publicExam.passThreshold, 3);
  assert.equal(publicExam.questions[0].options.A, '甲');
  assert.equal(publicExam.questions[0].answer, undefined);
  assert.deepEqual(result, { score: 2, total: 3, passThreshold: 3, passed: false });
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
