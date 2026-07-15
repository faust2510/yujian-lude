import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'relationships.routes.js'),
  'utf8',
);

test('relationship and partner IDs are validated before any database query', () => {
  const initiate = source.match(/router\.post\('\/relationships\/initiate'[\s\S]*?\n\}\);/)?.[0] || '';
  const confirmation = source.match(/async function handleRelationshipConfirmationRequest[\s\S]*?\n\}/)?.[0] || '';
  const approval = source.match(/router\.post\('\/relationships\/:id\/pastor-approve'[\s\S]*?\n\}\);/)?.[0] || '';
  const ending = source.match(/router\.delete\('\/relationships\/:id'[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(source, /const UUID_RE\s*=/);
  assert.match(initiate, /if \(!UUID_RE\.test\(partner_id\)\)[\s\S]*?await one/);
  assert.match(confirmation, /if \(!UUID_RE\.test\(req\.params\.id\)\)[\s\S]*?await tx/);
  assert.match(approval, /if \(!UUID_RE\.test\(req\.params\.id\)\)[\s\S]*?await one/);
  assert.match(ending, /if \(!UUID_RE\.test\(req\.params\.id\)\)[\s\S]*?await one/);
});
