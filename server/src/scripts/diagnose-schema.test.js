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
