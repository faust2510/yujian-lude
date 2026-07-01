export async function hasPassedRequiredCourseExam(one, { userId, requiredCourseId }) {
  if (!requiredCourseId) return false;
  const examPassed = await one(
    `SELECT 1
       FROM course_exam_attempts
      WHERE user_id = $1
        AND course_id = $2
        AND passed = TRUE
      LIMIT 1`,
    [userId, requiredCourseId]
  );
  return !!examPassed;
}
