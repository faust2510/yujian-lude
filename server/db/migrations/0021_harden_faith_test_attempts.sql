LOCK TABLE faith_tests IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id)::SMALLINT AS attempt_no
    FROM faith_tests
)
UPDATE faith_tests ft
   SET attempt_no = ranked.attempt_no
  FROM ranked
 WHERE ft.id = ranked.id
   AND ft.attempt_no IS DISTINCT FROM ranked.attempt_no;

CREATE UNIQUE INDEX IF NOT EXISTS idx_faith_tests_user_attempt
  ON faith_tests(user_id, attempt_no);
