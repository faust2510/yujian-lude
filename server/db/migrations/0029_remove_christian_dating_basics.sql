DELETE FROM course_exam_attempts
 WHERE course_id IN (
   SELECT id FROM courses WHERE slug = 'christian-dating-basics'
 );

DELETE FROM courses
 WHERE slug = 'christian-dating-basics';

DELETE FROM app_settings
 WHERE key IN ('match.require_light_course', 'match.light_course_id');
