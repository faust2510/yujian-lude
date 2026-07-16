ALTER TABLE course_pastor_reviews
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES course_units(id) ON DELETE CASCADE;

-- Legacy course-level reviews are attached to the first pastor node so pending
-- work remains reviewable without crediting every node at once.
UPDATE course_pastor_reviews review
   SET unit_id = (
    SELECT unit.id
      FROM course_units unit
     WHERE unit.course_id = review.course_id
       AND unit.is_pastor_node = TRUE
     ORDER BY unit.unit_index
     LIMIT 1
   )
 WHERE review.unit_id IS NULL;

WITH approved_nodes AS (
  SELECT review.user_id,
         review.course_id,
         COUNT(DISTINCT review.unit_id)::smallint AS confirmed
    FROM course_pastor_reviews review
   WHERE review.state = 'approved'
     AND review.unit_id IS NOT NULL
   GROUP BY review.user_id, review.course_id
), required_nodes AS (
  SELECT unit.course_id,
         COUNT(*)::smallint AS required
    FROM course_units unit
   WHERE unit.is_pastor_node = TRUE
   GROUP BY unit.course_id
)
UPDATE course_progress progress
   SET state = 'pastor_review',
       pastor_confirmed = approved.confirmed,
       updated_at = now()
  FROM approved_nodes approved
  JOIN required_nodes required ON required.course_id = approved.course_id
 WHERE progress.user_id = approved.user_id
   AND progress.course_id = approved.course_id
   AND progress.state = 'completed'
   AND approved.confirmed < required.required
   AND progress.pastor_confirmed > approved.confirmed;

DROP INDEX IF EXISTS idx_course_pastor_reviews_one_pending;
CREATE UNIQUE INDEX idx_course_pastor_reviews_one_pending
  ON course_pastor_reviews(user_id, course_id, unit_id)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_course_pastor_reviews_unit
  ON course_pastor_reviews(unit_id, state, created_at);
