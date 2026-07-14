import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'rewards.js'),
  'utf8',
);

test('exposure scoring ignores blank text and follows required profile fields', () => {
  assert.match(source, /NULLIF\(BTRIM\(p\.nickname\), ''\) IS NOT NULL/);
  assert.match(source, /NULLIF\(BTRIM\(p\.goal\), ''\) IS NOT NULL/);
  assert.match(source, /NULLIF\(BTRIM\(fp\.testimony\), ''\) IS NOT NULL/);
  assert.doesNotMatch(source, /fp\.coworker\s+IS NOT NULL/);
});
