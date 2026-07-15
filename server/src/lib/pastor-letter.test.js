import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libraryPath = path.join(__dirname, 'pastor-letter.js');

test('牧者介绍信输入会规范化并限制类型与长度', async () => {
  assert.equal(existsSync(libraryPath), true, 'pastor-letter.js should exist');
  const { normalizePastorLetterInput } = await import(pathToFileURL(libraryPath));

  assert.deepEqual(normalizePastorLetterInput({
    pastorName: ' 王牧师 ',
    pastorContact: ' pastor@example.com ',
    familyNote: ' 家庭情况稳定 ',
    faithNote: ' 已受洗 ',
    spiritualNote: ' 稳定灵修 ',
    churchLifeNote: ' 参与小组 ',
  }), {
    ok: true,
    value: {
      pastorName: '王牧师',
      pastorContact: 'pastor@example.com',
      familyNote: '家庭情况稳定',
      faithNote: '已受洗',
      spiritualNote: '稳定灵修',
      churchLifeNote: '参与小组',
    },
  });

  assert.match(normalizePastorLetterInput({ pastorContact: 'x@example.com' }).error, /牧者姓名/);
  assert.match(normalizePastorLetterInput({ pastorName: '王牧师' }).error, /联系方式/);
  assert.match(normalizePastorLetterInput({ pastorName: {}, pastorContact: 'x@example.com' }).error, /牧者姓名.*格式/);
  assert.match(normalizePastorLetterInput({
    pastorName: '王牧师',
    pastorContact: 'x@example.com',
    familyNote: 'a'.repeat(2001),
  }).error, /家庭情况.*2000/);
});

test('牧者介绍信核验动作拒绝自审、过期内容和重复状态', async () => {
  assert.equal(existsSync(libraryPath), true, 'pastor-letter.js should exist');
  const {
    normalizePastorLetterReviewAction,
    normalizePastorLetterReviewVersion,
    validatePastorLetterReview,
  } = await import(pathToFileURL(libraryPath));

  assert.equal(normalizePastorLetterReviewAction('approve'), true);
  assert.equal(normalizePastorLetterReviewAction('revoke'), false);
  assert.equal(normalizePastorLetterReviewAction('reject'), null);
  assert.equal(
    normalizePastorLetterReviewVersion(' 2026-07-15 00:00:00.123456+00 '),
    '2026-07-15 00:00:00.123456+00'
  );
  assert.equal(normalizePastorLetterReviewVersion('invalid'), null);
  assert.match(validatePastorLetterReview({
    actorId: 'user-1',
    letter: { user_id: 'user-1', is_verified: false, updated_at_version: '2026-07-15 00:00:00.123456+00' },
    nextVerified: true,
    expectedUpdatedAt: '2026-07-15 00:00:00.123456+00',
  }), /自己/);
  assert.match(validatePastorLetterReview({
    actorId: 'admin-1',
    letter: { user_id: 'user-1', is_verified: true, updated_at_version: '2026-07-15 00:00:00.123456+00' },
    nextVerified: true,
    expectedUpdatedAt: '2026-07-15 00:00:00.123456+00',
  }), /状态已变化/);
  assert.match(validatePastorLetterReview({
    actorId: 'admin-1',
    letter: { user_id: 'user-1', is_verified: false, updated_at_version: '2026-07-15 00:00:01.123456+00' },
    nextVerified: true,
    expectedUpdatedAt: '2026-07-15 00:00:00.123456+00',
  }), /内容已更新/);
  assert.equal(validatePastorLetterReview({
    actorId: 'admin-1',
    letter: { user_id: 'user-1', is_verified: false, updated_at_version: '2026-07-15 00:00:00.123456+00' },
    nextVerified: true,
    expectedUpdatedAt: '2026-07-15 00:00:00.123456+00',
  }), null);
});
