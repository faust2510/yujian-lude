import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matchGate = fs.readFileSync(path.join(root, 'lib/match-gate.js'), 'utf8');
const matchRoutes = fs.readFileSync(path.join(root, 'routes/match.routes.js'), 'utf8');

test('match qualification and candidate SQL require region and denomination', () => {
  assert.match(
    matchGate,
    /SELECT\s+church_name,\s*presbytery,\s*region,\s*denomination,\s*baptism_date,\s*faith_years,\s*testimony\s+FROM faith_profiles/i
  );
  assert.match(matchRoutes, /NULLIF\(BTRIM\(fp\.region\), ''\) IS NOT NULL/);
  assert.match(matchRoutes, /NULLIF\(BTRIM\(fp\.denomination\), ''\) IS NOT NULL/);
});

test('candidate SQL uses the platform day and returns a precise age without exposing birth date', () => {
  assert.match(matchRoutes, /AT TIME ZONE 'Asia\/Shanghai'/);
  assert.doesNotMatch(matchRoutes, /AT TIME ZONE 'UTC'/);
  assert.match(
    matchRoutes,
    /EXTRACT\s*\(YEAR FROM age\s*\(\s*\(now\(\) AT TIME ZONE 'Asia\/Shanghai'\)::date,\s*p\.birth_date\s*\)\s*\)::int AS age/i
  );
  assert.doesNotMatch(matchRoutes, /SELECT[^;]*p\.birth_date[,\s]/i);
});
