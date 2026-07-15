LOCK TABLE pastor_letters IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE pastor_letters
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

UPDATE pastor_letters
   SET verified_at = updated_at
 WHERE is_verified = TRUE
   AND verified_at IS NULL;

WITH ranked_letters AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS letter_rank
    FROM pastor_letters
)
DELETE FROM pastor_letters letter
 USING ranked_letters ranked
 WHERE letter.id = ranked.id
   AND ranked.letter_rank > 1;

DROP INDEX IF EXISTS idx_pastor_letters_user;

CREATE UNIQUE INDEX idx_pastor_letters_user
  ON pastor_letters(user_id);
