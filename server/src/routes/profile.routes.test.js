import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, 'profile.routes.js'), 'utf8');

test('endorsement creation response includes church for immediate UI display', () => {
  assert.match(
    source,
    /RETURNING\s+id,\s*kind,\s*name,\s*church,\s*state/i
  );
});

test('profile API persists a bounded signature and exposes authenticated avatar endpoints', () => {
  assert.match(source, /signature/);
  assert.match(source, /normalizedSignature\.length\s*>\s*80/);
  assert.match(source, /router\.post\('\/me\/avatar'/);
  assert.match(source, /router\.delete\('\/me\/avatar'/);
});
