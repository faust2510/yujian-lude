import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'courses.routes.js'),
  'utf8',
);

test('courses expose user request and pastor review endpoints', () => {
  assert.match(source, /router\.post\('\/courses\/:slug\/pastor-review'/);
  assert.match(source, /router\.get\('\/course-pastor-reviews'/);
  assert.match(source, /router\.patch\('\/course-pastor-reviews\/:id'/);
  assert.match(source, /router\.get\('\/course-pastor-reviews', requireAuth/);
  assert.match(source, /router\.patch\('\/course-pastor-reviews\/:id', requireAuth/);
});

test('course details include the current user pastor review state', () => {
  assert.match(source, /pastorReview/);
  assert.match(source, /pastor_review: pastorReview/);
  assert.match(source, /review_options/);
  assert.match(source, /endorsement_id/);
});

test('course reviews are scoped to their assigned reviewer and cannot be self-reviewed', () => {
  assert.match(source, /assigned_reviewer_id/);
  assert.match(source, /r\.user_id\s*<>/);
  assert.match(source, /req\.user\.role\s*===\s*'admin'/);
});

test('course review requests keep rejected history instead of overwriting it', () => {
  assert.doesNotMatch(source, /ON CONFLICT \(user_id, course_id\) DO UPDATE/);
  assert.match(source, /state\s*=\s*'pending'/);
});
