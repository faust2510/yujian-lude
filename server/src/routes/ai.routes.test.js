import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dirname, 'ai.routes.js'), 'utf8');

test('AI retrieval includes only confirmed uploads from published courses', () => {
  assert.match(source, /course_material_uploads/);
  assert.match(source, /extraction_state\s*=\s*'confirmed'/);
  assert.match(source, /publication_state\s*=\s*'published'/);
});
