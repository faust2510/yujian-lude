LOCK TABLE pastor_certifications IN SHARE ROW EXCLUSIVE MODE;

WITH ranked_pending AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY created_at DESC, id DESC
         ) AS pending_rank
    FROM pastor_certifications
   WHERE state = 'pending'
)
UPDATE pastor_certifications certification
   SET state = 'rejected'
  FROM ranked_pending pending
 WHERE certification.id = pending.id
   AND pending.pending_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pastor_certifications_one_pending
  ON pastor_certifications(user_id)
  WHERE state = 'pending';
