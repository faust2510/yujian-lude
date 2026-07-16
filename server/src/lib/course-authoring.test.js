import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  canEditCourse,
  canReviewCourse,
  nextPublicationState,
  normalizeCourseDraft,
  parseCourseMaterial,
  serializeCourseMaterial,
  validateCourseSubmission,
} from './course-authoring.js';

function completeDraft() {
  return {
    title: ' 婚姻预备课 ',
    subtitle: ' 牧养系列 ',
    description: ' 帮助信徒预备盟约婚姻。 ',
    units: [
      { unit_index: 1, title: ' 第一课 ', material: ' 正文一 ', is_pastor_node: false },
    ],
    exam: {
      pass_threshold: 80,
      questions: Array.from({ length: 3 }, (_, index) => ({
        question_index: index + 1,
        prompt: ` 问题 ${index + 1} `,
        options: [' 选项 A ', ' 选项 B '],
        correct_option: 0,
        explanation: ' 解析 ',
      })),
    },
  };
}

test('normalizes editable course drafts and restores consecutive indexes', () => {
  const draft = completeDraft();
  draft.subtitle = '   ';
  draft.units.push({ unit_index: 9, title: ' 第二课 ', material: ' 正文二 ', is_pastor_node: 1 });
  draft.exam.questions[1].question_index = 12;
  draft.exam.questions[1].correct_option = '1';

  const normalized = normalizeCourseDraft(draft);

  assert.equal(normalized.title, '婚姻预备课');
  assert.equal(normalized.subtitle, null);
  assert.equal(normalized.description, '帮助信徒预备盟约婚姻。');
  assert.deepEqual(normalized.units.map((unit) => unit.unit_index), [1, 2]);
  assert.equal(normalized.units[1].title, '第二课');
  assert.equal(normalized.units[1].material, '正文二');
  assert.equal(normalized.units[1].is_pastor_node, true);
  assert.deepEqual(normalized.exam.questions.map((question) => question.question_index), [1, 2, 3]);
  assert.equal(normalized.exam.questions[1].correct_option, 1);
  assert.deepEqual(normalized.exam.questions[0].options, ['选项 A', '选项 B']);
});

test('serializes structured material while remaining compatible with legacy plain text', () => {
  const structured = { format: 'markdown', body: '# 第一课\n正文' };

  assert.deepEqual(parseCourseMaterial(serializeCourseMaterial(structured)), structured);
  assert.equal(serializeCourseMaterial('旧课程正文'), '旧课程正文');
  assert.equal(parseCourseMaterial('旧课程正文'), '旧课程正文');
  assert.equal(parseCourseMaterial(null), '');
});

test('accepts a complete submission with one to thirty units and a valid exam', () => {
  assert.deepEqual(validateCourseSubmission(completeDraft()), {});
});

test('requires course title, description, consecutive units, and unit bodies', () => {
  const draft = completeDraft();
  draft.title = ' ';
  draft.description = '';
  draft.units = [
    { unit_index: 1, title: '', material: '正文' },
    { unit_index: 3, title: '第二课', material: '   ' },
  ];

  const errors = validateCourseSubmission(draft);

  assert.match(errors.title, /标题/);
  assert.match(errors.description, /简介/);
  assert.match(errors.units_message, /连续/);
  assert.match(errors.units[0].title, /标题/);
  assert.match(errors.units[1].material, /正文/);
});

test('limits submissions to one through thirty units', () => {
  const empty = completeDraft();
  empty.units = [];
  assert.match(validateCourseSubmission(empty).units_message, /1.*30/);

  const oversized = completeDraft();
  oversized.units = Array.from({ length: 31 }, (_, index) => ({
    unit_index: index + 1,
    title: `单元 ${index + 1}`,
    material: '正文',
  }));
  assert.match(validateCourseSubmission(oversized).units_message, /1.*30/);
});

test('requires three through fifty complete single-choice questions', () => {
  const draft = completeDraft();
  draft.exam.questions = [
    { question_index: 1, prompt: '', options: ['A'], correct_option: 2 },
    { question_index: 3, prompt: '问题', options: ['A', '', 'C', 'D', 'E', 'F', 'G'], correct_option: 0 },
  ];

  const errors = validateCourseSubmission(draft);

  assert.match(errors.exam.questions_message, /3.*50/);
  assert.match(errors.exam.questions_message, /连续/);
  assert.match(errors.exam.questions[0].prompt, /题目/);
  assert.match(errors.exam.questions[0].options_message, /2.*6/);
  assert.match(errors.exam.questions[0].correct_option, /正确答案/);
  assert.match(errors.exam.questions[1].options_message, /2.*6/);
  assert.match(errors.exam.questions[1].options[1], /选项/);
});

test('requires an integer percentage pass threshold from one to one hundred', () => {
  for (const threshold of [0, 101, 80.5, 'not-a-number']) {
    const draft = completeDraft();
    draft.exam.pass_threshold = threshold;
    assert.match(validateCourseSubmission(draft).exam.pass_threshold, /1.*100/);
  }
});

test('course authoring rules keep drafts editable and published courses reviewable only by admins', () => {
  assert.equal(canEditCourse({ id: 'pastor-1', role: 'pastor' }, { author_id: 'pastor-1', publication_state: 'draft' }), true);
  assert.equal(canEditCourse({ role: 'pastor' }, { author_id: 'other', publication_state: 'draft' }), false);
  assert.equal(canEditCourse({ id: 'pastor-1', role: 'pastor' }, { author_id: 'pastor-1', publication_state: 'pending_review' }), false);
  assert.equal(canEditCourse({ role: 'admin' }, { author_id: 'other', publication_state: 'published' }), true);
  assert.equal(canReviewCourse({ role: 'admin' }, { publication_state: 'pending_review' }), true);
  assert.equal(canReviewCourse({ role: 'pastor' }, { publication_state: 'pending_review' }), false);
  assert.equal(nextPublicationState('draft', 'submit'), 'pending_review');
  assert.equal(nextPublicationState('pending_review', 'approve'), 'published');
  assert.equal(nextPublicationState('pending_review', 'request_changes'), 'changes_requested');
  assert.equal(nextPublicationState('changes_requested', 'save'), 'changes_requested');
});

test('0032 removes the retired dating basics course and disables the obsolete light-course gate', () => {
  const migrationUrl = new URL('../../db/migrations/0032_retire_dating_basics_course.sql', import.meta.url);
  const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /christian-dating-basics/);
  assert.match(sql, /DELETE FROM course_units/i);
  assert.match(sql, /DELETE FROM courses/i);
  assert.match(sql, /match\.light_course_id/);
  assert.match(sql, /11111111-1111-1111-1111-111111111111/);
});

test('0030 adds idempotent publication and database-backed exam schema', () => {
  const migrationUrl = new URL('../../db/migrations/0030_pastor_authored_courses.sql', import.meta.url);
  const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8');

  for (const state of ['draft', 'pending_review', 'changes_requested', 'published', 'archived']) {
    assert.match(sql, new RegExp(`'${state}'`));
  }
  for (const column of ['author_id', 'publication_state', 'rewards_enabled', 'review_note', 'reviewed_by', 'reviewed_at']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'i'));
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS course_exams/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS course_exam_questions/i);
  assert.match(sql, /options\s+JSONB/i);
  assert.match(sql, /jsonb_array_length\(options\).*2.*6/is);
  assert.match(sql, /correct_option.*jsonb_array_length\(options\)/is);
  assert.match(sql, /UNIQUE\s*\(exam_id, question_index\)/i);
  assert.match(sql, /publication_state.*published.*is_published/is);
});

test('0030 migrates the complete Keller exam and enables its rewards', () => {
  const migrationUrl = new URL('../../db/migrations/0030_pastor_authored_courses.sql', import.meta.url);
  const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /keller-meaning-of-marriage/);
  assert.match(sql, /pass_threshold[^;]*80/is);
  assert.match(sql, /rewards_enabled\s*=\s*TRUE/i);
  for (let index = 1; index <= 10; index += 1) {
    assert.match(sql, new RegExp(`keller-${index}`));
  }
  for (const topic of ['盟约', '单身', '冲突', '身体', '群体']) {
    assert.match(sql, new RegExp(topic));
  }
});
