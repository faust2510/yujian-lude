import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessCoursePastorReview,
  canRequestCoursePastorReview,
  normalizeCoursePastorReviewAction,
  validateCoursePastorReviewNote,
} from './course-pastor-review.js';

test('the first pastor node can be requested after its unit is completed without an exam', () => {
  assert.equal(canRequestCoursePastorReview({
    progressState: 'pastor_review',
    nodeIndex: 5,
    firstPastorNodeIndex: 5,
    unitsDone: 5,
    totalUnits: 10,
    midtermApproved: false,
    examPassed: false,
  }), true);
});

test('legacy in-progress data can request the first pastor node once unit five is already done', () => {
  assert.equal(canRequestCoursePastorReview({
    progressState: 'in_progress',
    nodeIndex: 5,
    firstPastorNodeIndex: 5,
    unitsDone: 5,
    totalUnits: 10,
    midtermApproved: false,
    examPassed: false,
  }), true);
});

test('the graduation pastor node requires all units, midterm approval, and a passed exam', () => {
  assert.equal(canRequestCoursePastorReview({
    progressState: 'pastor_review',
    nodeIndex: 10,
    firstPastorNodeIndex: 5,
    unitsDone: 9,
    totalUnits: 10,
    midtermApproved: true,
    examPassed: true,
  }), false);
  assert.equal(canRequestCoursePastorReview({
    progressState: 'pastor_review',
    nodeIndex: 10,
    firstPastorNodeIndex: 5,
    unitsDone: 10,
    totalUnits: 10,
    midtermApproved: true,
    examPassed: true,
  }), true);
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
