import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../db.js', import.meta.url)), 'utf8');

test('every pooled database session uses the Asia Shanghai business timezone', () => {
  assert.match(source, /options:\s*['"]-c timezone=Asia\/Shanghai['"]/);
});
