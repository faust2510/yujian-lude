import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readOptional = (relativePath) => {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
};
const schema = read('db/schema.sql');
const migration = readOptional('db/migrations/0021_harden_faith_test_attempts.sql');
const matchGate = read('src/lib/match-gate.js');
const matchRoutes = read('src/routes/match.routes.js');
const diagnose = read('src/scripts/diagnose-schema.js');

test('faith test attempts have one stable sequence number per user', () => {
  assert.match(schema, /UNIQUE\s*\(user_id, attempt_no\)/);
  assert.match(migration, /ROW_NUMBER\(\) OVER \(PARTITION BY user_id/);
  assert.match(migration, /CREATE UNIQUE INDEX[^;]+faith_tests[^;]+\(user_id, attempt_no\)/s);
  assert.match(diagnose, /\['faith_tests', \['user_id', 'attempt_no'\]\]/);
});

test('match qualification remains true after any passing faith attempt', () => {
  assert.match(matchGate, /EXISTS\s*\(SELECT 1 FROM faith_tests[^)]*passed = TRUE/s);
  assert.doesNotMatch(matchGate, /faith_tests[^;]+ORDER BY created_at DESC LIMIT 1/s);
  assert.match(matchRoutes, /EXISTS\(SELECT 1 FROM faith_tests ft WHERE ft\.user_id = u\.id AND ft\.passed = TRUE\)/);
  assert.doesNotMatch(matchRoutes, /SELECT ft\.passed[^)]*ORDER BY ft\.created_at DESC LIMIT 1/);
});
