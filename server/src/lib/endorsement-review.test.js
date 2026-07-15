import test from 'node:test';
import assert from 'node:assert/strict';

import * as endorsementReview from './endorsement-review.js';

const { buildEndorsementReviewPatch, validateEndorsementDecision } = endorsementReview;

test('accepts only verified or rejected endorsement decisions', () => {
  assert.equal(validateEndorsementDecision('verified'), true);
  assert.equal(validateEndorsementDecision('rejected'), true);
  assert.equal(validateEndorsementDecision('approve'), false);
  assert.equal(validateEndorsementDecision('pending'), false);
  assert.equal(validateEndorsementDecision(undefined), false);
});

test('allows endorsement review only from pending to a terminal decision', () => {
  assert.equal(typeof endorsementReview.canReviewEndorsement, 'function');
  const { canReviewEndorsement } = endorsementReview;
  assert.equal(canReviewEndorsement('pending', 'verified'), true);
  assert.equal(canReviewEndorsement('pending', 'rejected'), true);
  assert.equal(canReviewEndorsement('verified', 'verified'), false);
  assert.equal(canReviewEndorsement('verified', 'rejected'), false);
  assert.equal(canReviewEndorsement('rejected', 'verified'), false);
  assert.equal(canReviewEndorsement('pending', 'pending'), false);
});

test('verified review records verifier and verification timestamp', () => {
  const reviewedAt = new Date('2026-06-27T12:00:00.000Z');
  const patch = buildEndorsementReviewPatch({
    decision: 'verified',
    reviewerId: 'admin-1',
    reviewedAt,
  });

  assert.deepEqual(patch, {
    state: 'verified',
    verifiedBy: 'admin-1',
    verifiedAt: reviewedAt,
  });
});

test('rejected review records reviewer but does not claim verification time', () => {
  const patch = buildEndorsementReviewPatch({
    decision: 'rejected',
    reviewerId: 'admin-1',
    reviewedAt: new Date('2026-06-27T12:00:00.000Z'),
  });

  assert.deepEqual(patch, {
    state: 'rejected',
    verifiedBy: 'admin-1',
    verifiedAt: null,
  });
});
