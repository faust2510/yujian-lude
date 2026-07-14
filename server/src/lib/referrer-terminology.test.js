import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('product-facing sources use the approved referrer label', () => {
  const sources = [
    readFileSync(path.join(serverRoot, 'db/seed.sql'), 'utf8'),
    readFileSync(path.join(serverRoot, 'src/lib/ai-knowledge.js'), 'utf8'),
    readFileSync(path.join(serverRoot, 'db/migrations/0012_rename_referrer_label.sql'), 'utf8'),
  ];

  assert.equal(sources.some(source => source.includes('成熟引荐人')), false);
  assert.match(sources[2], /引荐人确认/);
});
