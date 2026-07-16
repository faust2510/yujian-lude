UPDATE profiles
   SET birth_year = NULL,
       completion = LEAST(completion, 88),
       updated_at = now()
 WHERE birth_year IS NOT NULL
   AND (
     birth_year < 1940 OR
     birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 18
   );

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_birth_year_adult_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_birth_year_adult_check
  CHECK (
    birth_year IS NULL OR
    birth_year BETWEEN 1940 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 18
  );
