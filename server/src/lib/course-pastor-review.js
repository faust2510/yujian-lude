export function canRequestCoursePastorReview({ progressState, examPassed }) {
  return progressState === 'pastor_review' && examPassed === true;
}

export function normalizeCoursePastorReviewAction(action) {
  if (action === 'approve') return 'approved';
  if (action === 'reject') return 'rejected';
  return null;
}

export function canAccessCoursePastorReview({
  actorId,
  actorRole,
  subjectId,
  assignedReviewerId,
}) {
  if (!actorId || actorId === subjectId) return false;
  if (actorRole === 'admin') return true;
  return assignedReviewerId === actorId;
}

export function validateCoursePastorReviewNote({ action, note }) {
  if (action === 'reject' && !String(note || '').trim()) {
    return '退回申请时必须填写原因';
  }
  return null;
}
