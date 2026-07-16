ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Legacy birth years do not establish an exact birthday. Keep them for display,
-- but require users to complete birth_date before their profile is complete.
UPDATE profiles
   SET completion = LEAST(completion, 88),
       updated_at = now()
 WHERE birth_date IS NULL;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_birth_year_adult_check;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_birth_date_adult_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_birth_date_adult_check
  CHECK (
    birth_date IS NULL OR
    birth_date BETWEEN DATE '1940-01-01'
      AND ((now() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '18 years')::date
  );
