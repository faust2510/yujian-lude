import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, 'diagnose-schema.js'), 'utf8');

test('schema diagnosis checks community post state enum values used by feeds', () => {
  assert.match(source, /\['post_state', \['visible', 'pinned', 'removed', 'featured'\]\]/);
});

test('schema diagnosis checks community group columns used by group creation', () => {
  assert.match(source, /\['community_groups', \['id', 'name', 'category', 'join_policy', 'cover_image', 'created_by'\]\]/);
});

test('schema diagnosis checks course exam attempts used by relationship gates', () => {
  assert.match(source, /'course_exam_attempts'/);
  assert.match(source, /\['course_exam_attempts', \['user_id', 'course_id', 'score', 'passed', 'answers'\]\]/);
});

test('schema diagnosis checks textbook reading system tables and constraints', () => {
  for (const table of ['textbooks', 'textbook_chapters', 'textbook_reading_progress', 'course_unit_readings']) {
    assert.match(source, new RegExp(`'${table}'`));
  }

  assert.match(source, /\['textbooks', \['slug', 'title', 'visibility', 'source_filename', 'license_note'\]\]/);
  assert.match(source, /\['textbook_chapters', \['textbook_id', 'chapter_index', 'title', 'body_html', 'body_text', 'word_count'\]\]/);
  assert.match(source, /\['textbook_reading_progress', \['user_id', 'chapter_id', 'completed', 'completed_at', 'last_read_at'\]\]/);
  assert.match(source, /\['course_unit_readings', \['course_unit_id', 'chapter_id', 'required', 'sort_order'\]\]/);
  assert.match(source, /\['textbook_chapters', \['textbook_id', 'chapter_index'\]\]/);
  assert.match(source, /\['textbook_reading_progress', \['user_id', 'chapter_id'\]\]/);
  assert.match(source, /\['course_unit_readings', \['course_unit_id', 'chapter_id'\]\]/);
});
