import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessCoursePastorReview,
  canRequestCoursePastorReview,
  normalizeCoursePastorReviewAction,
  validateCoursePastorReviewNote,
} from './course-pastor-review.js';

test('course review requests require a passed exam and pastor-review state', () => {
  assert.equal(canRequestCoursePastorReview({ progressState: 'pastor_review', examPassed: true }), true);
  assert.equal(canRequestCoursePastorReview({ progressState: 'in_progress', examPassed: true }), false);
  assert.equal(canRequestCoursePastorReview({ progressState: 'pastor_review', examPassed: false }), false);
});

test('course pastor review actions map to stored states', () => {
  assert.equal(normalizeCoursePastorReviewAction('approve'), 'approved');
  assert.equal(normalizeCoursePastorReviewAction('reject'), 'rejected');
  assert.equal(normalizeCoursePastorReviewAction('other'), null);
});

test('pastors can only access assigned reviews and nobody can review themselves', () => {
  const base = {
    actorId: 'reviewer-1',
    subjectId: 'student-1',
    assignedReviewerId: 'reviewer-1',
  };

  assert.equal(canAccessCoursePastorReview({ ...base, actorRole: 'pastor' }), true);
  assert.equal(canAccessCoursePastorReview({ ...base, actorRole: 'pastor', actorId: 'reviewer-2' }), false);
  assert.equal(canAccessCoursePastorReview({ ...base, actorRole: 'free' }), true);
  assert.equal(canAccessCoursePastorReview({ ...base, actorRole: 'admin', actorId: 'admin-1' }), true);
  assert.equal(canAccessCoursePastorReview({ ...base, actorRole: 'admin', actorId: 'student-1' }), false);
  assert.equal(canAccessCoursePastorReview({ ...base, actorRole: 'free', actorId: 'reviewer-2' }), false);
});

test('rejecting a course review requires a useful reason', () => {
  assert.equal(validateCoursePastorReviewNote({ action: 'approve', note: '' }), null);
  assert.match(validateCoursePastorReviewNote({ action: 'reject', note: '' }), /原因/);
  assert.equal(validateCoursePastorReviewNote({ action: 'reject', note: '请补充第十单元的反思记录' }), null);
});
