export function validateEndorsementDecision(decision) {
  return decision === 'verified' || decision === 'rejected';
}

export function canReviewEndorsement(currentState, decision) {
  return currentState === 'pending' && validateEndorsementDecision(decision);
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
