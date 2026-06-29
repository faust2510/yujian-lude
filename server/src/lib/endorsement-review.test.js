import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEndorsementReviewPatch, validateEndorsementDecision } from './endorsement-review.js';

test('accepts only verified or rejected endorsement decisions', () => {
  assert.equal(validateEndorsementDecision('verified'), true);
  assert.equal(validateEndorsementDecision('rejected'), true);
  assert.equal(validateEndorsementDecision('approve'), false);
  assert.equal(validateEndorsementDecision('pending'), false);
  assert.equal(validateEndorsementDecision(undefined), false);
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
