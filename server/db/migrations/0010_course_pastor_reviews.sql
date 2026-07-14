DO $$ BEGIN
  CREATE TYPE course_pastor_review_state AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS course_pastor_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  state          course_pastor_review_state NOT NULL DEFAULT 'pending',
  requested_note TEXT,
  review_note    TEXT,
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_pastor_reviews_state
  ON course_pastor_reviews(state, created_at);
CREATE INDEX IF NOT EXISTS idx_course_pastor_reviews_reviewer
  ON course_pastor_reviews(reviewed_by, reviewed_at DESC);
