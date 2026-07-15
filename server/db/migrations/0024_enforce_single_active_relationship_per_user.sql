LOCK TABLE relationships IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT user_id, count(*)
          FROM (
            SELECT user_a AS user_id FROM relationships WHERE state <> 'ended'
            UNION ALL
            SELECT user_b AS user_id FROM relationships WHERE state <> 'ended'
          ) participants
         GROUP BY user_id
        HAVING count(*) > 1
      ) conflicts
  ) THEN
    RAISE EXCEPTION 'cannot enforce one active relationship per user while conflicting relationships exist';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_single_active_relationship_per_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  first_lock BIGINT;
  second_lock BIGINT;
BEGIN
  IF NEW.state = 'ended' THEN
    RETURN NEW;
  END IF;

  first_lock := LEAST(hashtextextended(NEW.user_a::text, 0), hashtextextended(NEW.user_b::text, 0));
  second_lock := GREATEST(hashtextextended(NEW.user_a::text, 0), hashtextextended(NEW.user_b::text, 0));
  PERFORM pg_advisory_xact_lock(first_lock);
  PERFORM pg_advisory_xact_lock(second_lock);

  IF EXISTS (
    SELECT 1
      FROM relationships active
     WHERE active.state <> 'ended'
       AND active.id IS DISTINCT FROM NEW.id
       AND (
         active.user_a IN (NEW.user_a, NEW.user_b)
         OR active.user_b IN (NEW.user_a, NEW.user_b)
       )
       AND NOT (active.user_a = NEW.user_a AND active.user_b = NEW.user_b)
  ) THEN
    RAISE EXCEPTION 'a relationship participant already has an active relationship'
      USING ERRCODE = '23505', CONSTRAINT = 'idx_relationships_one_active_user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_relationships_one_active_user ON relationships;
CREATE TRIGGER trg_relationships_one_active_user
BEFORE INSERT OR UPDATE OF user_a, user_b, state ON relationships
FOR EACH ROW
EXECUTE FUNCTION enforce_single_active_relationship_per_user();
