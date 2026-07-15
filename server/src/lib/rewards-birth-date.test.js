import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'rewards.js'), 'utf8');

test('exposure counts a complete birth date instead of a legacy birth year', () => {
  assert.match(source, /p\.birth_date\s+IS NOT NULL/);
  assert.doesNotMatch(source, /p\.birth_year\s+IS NOT NULL/);
});
