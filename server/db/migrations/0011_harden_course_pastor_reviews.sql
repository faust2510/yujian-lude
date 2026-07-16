ALTER TABLE endorsements
  ADD COLUMN IF NOT EXISTS endorser_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_endorsements_endorser
  ON endorsements(endorser_user_id, state);

ALTER TABLE course_pastor_reviews
  ADD COLUMN IF NOT EXISTS endorsement_id UUID REFERENCES endorsements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE course_pastor_reviews
  DROP CONSTRAINT IF EXISTS course_pastor_reviews_user_id_course_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_pastor_reviews_one_pending
  ON course_pastor_reviews(user_id, course_id)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_course_pastor_reviews_assigned
  ON course_pastor_reviews(assigned_reviewer_id, state, created_at);

-- Older builds could grant the same deep-course reward more than once. Keep the
-- earliest ledger entry, then rebuild the cached earned balance from the ledger.
WITH ranked_course_rewards AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, reason, ref_id
           ORDER BY created_at, id
         ) AS row_number
    FROM points_ledger
   WHERE direction = 'credit'
     AND reason = 'points.course_complete'
     AND ref_id IS NOT NULL
)
DELETE FROM points_ledger ledger
 USING ranked_course_rewards ranked
 WHERE ledger.id = ranked.id
   AND ranked.row_number > 1;

UPDATE points_balance balance
   SET earned_total = COALESCE((
         SELECT SUM(
           CASE ledger.direction
             WHEN 'credit' THEN ledger.amount
             WHEN 'debit' THEN -ledger.amount
           END
         )::int
           FROM points_ledger ledger
          WHERE ledger.user_id = balance.user_id
            AND ledger.pool = 'earned'
       ), 0),
       updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_points_course_completion_once
  ON points_ledger(user_id, reason, ref_id)
  WHERE direction = 'credit'
    AND reason = 'points.course_complete'
    AND ref_id IS NOT NULL;
