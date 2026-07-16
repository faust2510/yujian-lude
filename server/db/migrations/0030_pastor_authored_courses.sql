-- Add pastor-authored course publication workflow and database-backed exams.

DO $$ BEGIN
  CREATE TYPE course_publication_state AS ENUM (
    'draft',
    'pending_review',
    'changes_requested',
    'published',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS publication_state course_publication_state;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS rewards_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing catalog courses inherit their current public visibility exactly once.
UPDATE courses
   SET publication_state = CASE
         WHEN is_published THEN 'published'::course_publication_state
         ELSE 'draft'::course_publication_state
       END
 WHERE publication_state IS NULL;

UPDATE courses
   SET published_at = COALESCE(published_at, created_at)
 WHERE publication_state = 'published'
   AND published_at IS NULL;

ALTER TABLE courses ALTER COLUMN publication_state SET DEFAULT 'draft';
ALTER TABLE courses ALTER COLUMN publication_state SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE courses
    ADD CONSTRAINT courses_publication_is_published_consistent
    CHECK ((publication_state = 'published') = is_published);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_courses_author_publication
  ON courses(author_id, publication_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_courses_publication
  ON courses(publication_state, sort_order, created_at);

CREATE TABLE IF NOT EXISTS course_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
  pass_threshold SMALLINT NOT NULL DEFAULT 80 CHECK (pass_threshold BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES course_exams(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  question_index SMALLINT NOT NULL CHECK (question_index BETWEEN 1 AND 50),
  prompt TEXT NOT NULL CHECK (length(btrim(prompt)) > 0),
  options JSONB NOT NULL CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 6
  ),
  correct_option SMALLINT NOT NULL CHECK (
    correct_option >= 0
    AND correct_option < jsonb_array_length(options)
  ),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, question_index),
  UNIQUE (exam_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_course_exam_questions_exam
  ON course_exam_questions(exam_id, question_index);

-- Preserve the complete flagship exam while moving its source of truth to SQL.
WITH keller_exam AS (
  INSERT INTO course_exams (course_id, pass_threshold)
  SELECT id, 80
    FROM courses
   WHERE slug = 'keller-meaning-of-marriage'
  ON CONFLICT (course_id) DO UPDATE
    SET pass_threshold = EXCLUDED.pass_threshold,
        updated_at = now()
  RETURNING id
), questions(question_key, question_index, prompt, options, correct_option, explanation) AS (
  VALUES
    (
      'keller-1', 1, '课程强调婚姻首先应被理解为：',
      '["满足个人浪漫想象的安排", "双方利益交换的合同", "在基督里彼此委身的盟约", "解决孤独的唯一方式"]'::jsonb,
      2, NULL
    ),
    (
      'keller-2', 2, '面对配偶或未来配偶的软弱，课程鼓励的方向是：',
      '["用恩典和真理帮助彼此成长", "立刻寻找更完美的人", "用羞辱推动对方改变", "忽略所有问题"]'::jsonb,
      0, NULL
    ),
    (
      'keller-3', 3, '单身和婚姻在基督徒生命中应如何理解？',
      '["单身必然低于婚姻", "婚姻才证明生命完整", "二者都应在永恒国度中被重新定位", "单身者不需要预备关系"]'::jsonb,
      2, NULL
    ),
    (
      'keller-4', 4, '婚姻中的友谊与扶持，核心不是：',
      '["彼此认识", "彼此代祷", "彼此成全", "彼此控制"]'::jsonb,
      3, NULL
    ),
    (
      'keller-5', 5, '课程中的“终生盟约”意味着：',
      '["完全不会经历冲突", "以信实委身承载真实生活", "只在感觉强烈时维持关系", "把婚姻当作个人成就奖章"]'::jsonb,
      1, NULL
    ),
    (
      'keller-6', 6, '当婚姻中的冲突显出自己的骄傲和恐惧时，福音导向的回应是：',
      '["只证明对方的问题更严重", "承认自己的罪和防卫模式，在恩典中学习悔改", "用沉默惩罚对方", "把所有冲突解释为性格不合"]'::jsonb,
      1, NULL
    ),
    (
      'keller-7', 7, '关于婚姻中的身体与亲密，课程强调：',
      '["身体与信仰无关，只是私人选择", "亲密只要双方愿意就没有属灵意义", "身体属于主，亲密需要在盟约、尊严和圣洁中理解", "谈论身体一定是不属灵的"]'::jsonb,
      2, NULL
    ),
    (
      'keller-8', 8, '为什么婚姻需要教会群体和牧者节点的提醒？',
      '["因为两个人完全没有判断力", "因为群体能提供见证、保护和盲点提醒", "因为婚姻只是教会管理事务", "因为第三方应当控制每个决定"]'::jsonb,
      1, NULL
    ),
    (
      'keller-9', 9, '课程如何看待浪漫感觉和盟约承诺的关系？',
      '["浪漫感觉应当完全被否定", "只有感觉强烈时才需要承诺", "感觉是礼物，但不能取代信实委身", "承诺只是没有感觉时的妥协"]'::jsonb,
      2, NULL
    ),
    (
      'keller-10', 10, '完成婚姻装备课程后，进入关系更成熟的标志是：',
      '["更会包装自己以获得匹配", "能更真实地认识自己、尊重对方，并在真理和群体中前行", "认为自己已经不需要任何提醒", "把课程当作获得权益的形式流程"]'::jsonb,
      1, NULL
)
INSERT INTO course_exam_questions (
  exam_id,
  question_key,
  question_index,
  prompt,
  options,
  correct_option,
  explanation
)
SELECT exam.id,
       questions.question_key,
       questions.question_index,
       questions.prompt,
       questions.options,
       questions.correct_option,
       questions.explanation
  FROM keller_exam exam
 CROSS JOIN questions
ON CONFLICT (exam_id, question_index) DO UPDATE
  SET question_key = EXCLUDED.question_key,
      prompt = EXCLUDED.prompt,
      options = EXCLUDED.options,
      correct_option = EXCLUDED.correct_option,
      explanation = EXCLUDED.explanation,
      updated_at = now();

UPDATE courses
   SET rewards_enabled = TRUE
 WHERE slug = 'keller-meaning-of-marriage';
