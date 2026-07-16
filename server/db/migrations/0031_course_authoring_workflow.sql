-- Preserve the editable authoring document independently from the published tables.
-- This lets a draft retain incomplete units/questions while 0030's relational
-- constraints continue to protect content that can be published.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS authoring_payload JSONB;

UPDATE courses
   SET authoring_payload = '{}'::jsonb
 WHERE authoring_payload IS NULL;

ALTER TABLE courses
  ALTER COLUMN authoring_payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN authoring_payload SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE courses
    ADD CONSTRAINT courses_authoring_payload_object
    CHECK (jsonb_typeof(authoring_payload) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_courses_authoring_workflow
  ON courses(author_id, publication_state, updated_at DESC);
