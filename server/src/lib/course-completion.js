export function computeCourseState({ unitsDone, totalUnits, pastorConfirmed = 0, pastorNodeCount = 0 }) {
  const allPassed = Number(unitsDone) >= Number(totalUnits) && Number(totalUnits) > 0;
  if (!allPassed) return 'in_progress';

  const confirmedNodes = Number(pastorConfirmed) || 0;
  const requiredPastorNodes = Number(pastorNodeCount) || 0;
  if (requiredPastorNodes > 0 && confirmedNodes < requiredPastorNodes) return 'pastor_review';

  return 'completed';
}

export function shouldGrantCourseCompletionRewards({ courseId, lightCourseId }) {
  return !!courseId && String(courseId) !== String(lightCourseId || '');
}
