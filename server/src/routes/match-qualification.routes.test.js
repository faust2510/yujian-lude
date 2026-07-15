import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matchRoute = readFileSync(path.join(__dirname, 'match.routes.js'), 'utf8');
const matchGate = readFileSync(path.join(__dirname, '..', 'lib', 'match-gate.js'), 'utf8');
const matchQualification = readFileSync(path.join(__dirname, '..', 'lib', 'match-qualification.js'), 'utf8');

test('match gate loads complete birth dates for adult qualification', () => {
  assert.match(matchGate, /SELECT\s+completion,\s*privacy_ok,\s*birth_date,\s*birth_year\s+FROM profiles/i);
});

test('candidate query mirrors adult and faith-profile qualification fields', () => {
  assert.match(matchRoute, /p\.birth_date\s+<=\s*\(\(now\(\) AT TIME ZONE 'Asia\/Shanghai'\)::date - INTERVAL '18 years'\)::date/i);
  assert.match(matchRoute, /fp\.presbytery/);
  assert.match(matchRoute, /fp\.baptism_date\s+IS NOT NULL/);
  assert.match(matchRoute, /fp\.faith_years\s+>=\s+0/);
});

test('members of any active relationship are outside the match pool', () => {
  assert.match(matchGate, /FROM relationships[\s\S]*state\s*<>\s*'ended'/i);
  assert.match(matchGate, /inPool:\s*qualification\.inPool\s*&&\s*!activeRelationship/);
  assert.match(matchGate, /relationshipBlocked:\s*activeRelationship/);
  assert.match(matchQualification, /missing\.push\('relationship'\)/);
  assert.match(matchQualification, /relationship:\s*\{ key: 'relationship'/);
});

test('candidate age filters use complete birth dates and the Asia Shanghai date boundary', () => {
  assert.doesNotMatch(matchRoute, /currentYear\s*-\s*candidateFilters\.(?:minAge|maxAge)/);
  assert.match(matchRoute, /p\.birth_date\s*<=\s*\(\(now\(\) AT TIME ZONE 'Asia\/Shanghai'\)::date - \(\$\$\{params\.length\} \* INTERVAL '1 year'\)\)::date/);
  assert.match(matchRoute, /p\.birth_date\s*>\s*\(\(now\(\) AT TIME ZONE 'Asia\/Shanghai'\)::date - \(\$\$\{params\.length\} \* INTERVAL '1 year'\)\)::date/);
  assert.match(matchRoute, /SELECT u\.id, p\.nickname, p\.city, p\.birth_year/);
});

test('candidate query excludes candidates in any active relationship with anyone', () => {
  assert.match(
    matchRoute,
    /NOT EXISTS\(SELECT 1 FROM relationships r[\s\S]*?\(r\.user_a\s*=\s*u\.id\s+OR\s+r\.user_b\s*=\s*u\.id\)[\s\S]*?r\.state\s*<>\s*'ended'\)/,
  );
});

test('intent writes lock both participants and recheck active relationships inside the transaction', () => {
  const intentRoute = matchRoute.slice(
    matchRoute.indexOf("router.post('/match/:targetId/intent'"),
    matchRoute.indexOf('// 谁看过我'),
  );
  const transaction = intentRoute.indexOf('const outcome = await tx(async (db) =>');
  const participantLock = intentRoute.indexOf('hashtextextended', transaction);
  const relationshipRecheck = intentRoute.indexOf("state <> 'ended'", participantLock);
  const matchWrite = intentRoute.indexOf('INSERT INTO matches', relationshipRecheck);

  assert.ok(transaction >= 0);
  assert.ok(participantLock > transaction);
  assert.ok(relationshipRecheck > participantLock);
  assert.ok(matchWrite > relationshipRecheck);
});
