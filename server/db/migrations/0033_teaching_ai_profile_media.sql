--牧者教材模板、受控媒体与受限 AI 教导助手。
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_signature_length;
ALTER TABLE profiles ADD CONSTRAINT profiles_signature_length CHECK (signature IS NULL OR char_length(signature) <= 80);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'system_course';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS scripture_references TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS ai_eligible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_template_type_valid;
ALTER TABLE courses ADD CONSTRAINT courses_template_type_valid CHECK (template_type IN ('system_course', 'reading_guide', 'short_lesson'));

CREATE TABLE IF NOT EXISTS course_material_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('application/epub+zip', 'application/pdf')),
  storage_key TEXT NOT NULL UNIQUE,
  license_note TEXT NOT NULL,
  extracted_text TEXT,
  extraction_state TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_state IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_daily_usage (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE ai_consultations ADD COLUMN IF NOT EXISTS citations JSONB;
ALTER TABLE ai_consultations ADD COLUMN IF NOT EXISTS model_name TEXT;
