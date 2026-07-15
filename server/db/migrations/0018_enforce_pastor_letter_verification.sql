LOCK TABLE pastor_letters IN SHARE ROW EXCLUSIVE MODE;

UPDATE pastor_letters
   SET is_verified = FALSE,
       verified_by = NULL,
       verified_at = NULL
 WHERE (is_verified = TRUE AND (
          verified_by IS NULL
          OR verified_at IS NULL
          OR verified_by = user_id
       ))
    OR (is_verified = FALSE AND (
          verified_by IS NOT NULL
          OR verified_at IS NOT NULL
       ));

ALTER TABLE pastor_letters
  DROP CONSTRAINT IF EXISTS pastor_letters_verified_by_fkey,
  DROP CONSTRAINT IF EXISTS pastor_letters_verification_consistent,
  ADD CONSTRAINT pastor_letters_verified_by_fkey
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pastor_letters_verification_consistent CHECK (
    (
      is_verified = TRUE
      AND verified_by IS NOT NULL
      AND verified_at IS NOT NULL
      AND verified_by <> user_id
    )
    OR
    (
      is_verified = FALSE
      AND verified_by IS NULL
      AND verified_at IS NULL
    )
  );

CREATE OR REPLACE FUNCTION reset_pastor_letter_verification_on_content_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_verified := FALSE;
  NEW.verified_by := NULL;
  NEW.verified_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pastor_letters_reset_verification_on_content_change ON pastor_letters;

CREATE TRIGGER pastor_letters_reset_verification_on_content_change
BEFORE UPDATE OF pastor_name, pastor_contact, family_note, faith_note, spiritual_note, church_life_note
ON pastor_letters
FOR EACH ROW
WHEN (
  ROW(OLD.pastor_name, OLD.pastor_contact, OLD.family_note, OLD.faith_note,
      OLD.spiritual_note, OLD.church_life_note)
  IS DISTINCT FROM
  ROW(NEW.pastor_name, NEW.pastor_contact, NEW.family_note, NEW.faith_note,
      NEW.spiritual_note, NEW.church_life_note)
)
EXECUTE FUNCTION reset_pastor_letter_verification_on_content_change();
