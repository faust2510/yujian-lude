import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('0031 stores incomplete authoring documents without weakening published content constraints', () => {
  const url = new URL('../../db/migrations/0031_course_authoring_workflow.sql', import.meta.url);
  const sql = readFileSync(fileURLToPath(url), 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS authoring_payload JSONB/i);
  assert.match(sql, /ALTER COLUMN authoring_payload SET NOT NULL/i);
  assert.match(sql, /jsonb_typeof\(authoring_payload\) = 'object'/i);
  assert.match(sql, /idx_courses_authoring_workflow/i);
});
