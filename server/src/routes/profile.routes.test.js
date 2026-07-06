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
