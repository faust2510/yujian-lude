import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(root, 'Match.jsx'), 'utf8');

test('match cards render the precise server-computed age', () => {
  assert.match(source, /c\.age\s*!==\s*null\s*&&\s*c\.age\s*!==\s*undefined/);
  assert.match(source, /`\$\{c\.age\}岁 · `/);
  assert.doesNotMatch(source, /new Date\(\)\.getFullYear\(\)\s*-\s*c\.birth_year/);
});
