LOCK TABLE faith_tests IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM faith_tests
     WHERE score < 0 OR score > 20
  ) THEN
    RAISE EXCEPTION 'faith_tests contains scores outside the supported 0..20 range';
  END IF;
END
$$;

UPDATE faith_tests
   SET passed = (score >= 15)
 WHERE passed IS DISTINCT FROM (score >= 15);

ALTER TABLE faith_tests
  DROP CONSTRAINT IF EXISTS faith_tests_score_range_check;

ALTER TABLE faith_tests
  DROP CONSTRAINT IF EXISTS faith_tests_passed_score_check;

ALTER TABLE faith_tests
  ADD CONSTRAINT faith_tests_score_range_check
  CHECK (score BETWEEN 0 AND 20);

ALTER TABLE faith_tests
  ADD CONSTRAINT faith_tests_passed_score_check
  CHECK (passed = (score >= 15));
