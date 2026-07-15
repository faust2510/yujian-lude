export function computeCourseState({
  currentState,
  unitsDone,
  totalUnits,
  pastorConfirmed = 0,
  pastorNodeCount = 0,
  pastorNodeIndexes = [],
  examPassed = false,
}) {
  if (currentState === 'completed') return 'completed';

  const allPassed = Number(unitsDone) >= Number(totalUnits) && Number(totalUnits) > 0;
  const confirmedNodes = Number(pastorConfirmed) || 0;
  const requiredPastorNodes = Number(pastorNodeCount) || 0;
  const firstPastorNodeIndex = [...pastorNodeIndexes].map(Number).sort((a, b) => a - b)[0];

  if (requiredPastorNodes > 0 && firstPastorNodeIndex && Number(unitsDone) >= firstPastorNodeIndex && confirmedNodes < 1) {
    return 'pastor_review';
  }
  if (!allPassed) return 'in_progress';

  if (requiredPastorNodes > 0 && examPassed !== true) return 'pastor_review';
  if (requiredPastorNodes > 0 && confirmedNodes < requiredPastorNodes) return 'pastor_review';

  return 'completed';
}

export function shouldGrantCourseCompletionRewards({ courseId, lightCourseId }) {
  return !!courseId && String(courseId) !== String(lightCourseId || '');
}
