-- Retire the old "恋爱必修课" catalog entry and remove the obsolete light-course gate.
UPDATE app_settings
   SET value = 'false',
       label = '当前不设置额外轻量课程门槛',
       updated_at = now()
 WHERE key = 'match.require_light_course';

UPDATE app_settings
   SET value = '"11111111-1111-1111-1111-111111111111"',
       label = '预留课程门槛 ID',
       updated_at = now()
 WHERE key = 'match.light_course_id';

DELETE FROM course_exam_attempts
 WHERE course_id = '22222222-2222-2222-2222-222222222222'::uuid;

DELETE FROM course_units
 WHERE course_id = '22222222-2222-2222-2222-222222222222'::uuid;

DELETE FROM courses
 WHERE slug = 'christian-dating-basics';
