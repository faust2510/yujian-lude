-- Add first-class textbook reading support for course units.

CREATE TABLE IF NOT EXISTS textbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_image TEXT,
  source_filename TEXT,
  license_note TEXT,
  visibility TEXT NOT NULL DEFAULT 'login_required',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS textbook_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  source_href TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (textbook_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS textbook_reading_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES textbook_chapters(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS course_unit_readings (
  course_unit_id UUID NOT NULL REFERENCES course_units(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES textbook_chapters(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course_unit_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_textbook_chapters_textbook ON textbook_chapters(textbook_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_textbook_progress_user ON textbook_reading_progress(user_id, completed, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_unit_readings_unit ON course_unit_readings(course_unit_id, sort_order);
