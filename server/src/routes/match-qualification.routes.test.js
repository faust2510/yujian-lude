import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matchRoute = readFileSync(path.join(__dirname, 'match.routes.js'), 'utf8');
const matchGate = readFileSync(path.join(__dirname, '..', 'lib', 'match-gate.js'), 'utf8');

test('match gate loads birth year for adult qualification', () => {
  assert.match(matchGate, /SELECT\s+completion,\s*privacy_ok,\s*birth_year\s+FROM profiles/i);
});

test('candidate query mirrors adult and faith-profile qualification fields', () => {
  assert.match(matchRoute, /p\.birth_year\s+BETWEEN\s+1940\s+AND/i);
  assert.match(matchRoute, /fp\.presbytery/);
  assert.match(matchRoute, /fp\.baptism_date\s+IS NOT NULL/);
  assert.match(matchRoute, /fp\.faith_years\s+>=\s+0/);
});
