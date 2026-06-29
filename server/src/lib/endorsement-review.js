export function validateEndorsementDecision(decision) {
  return decision === 'verified' || decision === 'rejected';
}

export function buildEndorsementReviewPatch({ decision, reviewerId, reviewedAt = new Date() }) {
  if (!validateEndorsementDecision(decision)) {
    throw new Error('Invalid endorsement decision');
  }

  return {
    state: decision,
    verifiedBy: reviewerId,
    verifiedAt: decision === 'verified' ? reviewedAt : null,
  };
}
