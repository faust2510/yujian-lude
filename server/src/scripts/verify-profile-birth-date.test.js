import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

for (const script of ['verify-mvp-flow.js', 'verify-real-users-flow.js']) {
  test(`${script} submits an exact birth date when completing profiles`, () => {
    const source = fs.readFileSync(path.join(root, 'src/scripts', script), 'utf8');
    const completeProfile = source.slice(
      source.indexOf('async function completeProfile'),
      source.indexOf("await client.put('/me/faith'"),
    );

    assert.match(completeProfile, /birth_date:\s*['`]/);
    assert.doesNotMatch(completeProfile, /birth_year:/);
  });
}

for (const script of ['verify-mvp-flow.js', 'verify-real-users-flow.js']) {
  test(`${script} creates email-verified admin reviewers`, () => {
    const source = fs.readFileSync(path.join(root, 'src/scripts', script), 'utf8');
    const makeAdmin = source.slice(
      source.indexOf('async function makeAdmin'),
      source.indexOf('async function completeProfile'),
    );

    assert.match(makeAdmin, /SET\s+role\s*=\s*'admin'\s*,\s*email_verified\s*=\s*TRUE/i);
  });
}

test('verify-real-users approves the midterm review before submitting unit six', () => {
  const source = fs.readFileSync(path.join(root, 'src/scripts/verify-real-users-flow.js'), 'utf8');
  const completeCourse = source.slice(
    source.indexOf('async function completeCourse'),
    source.indexOf('async function completeLightCourse'),
  );
  const deepCourse = source.slice(
    source.indexOf('async function completeDeepMarriageCourse'),
    source.indexOf('async function onboard'),
  );

  assert.match(completeCourse, /afterUnit/);
  assert.match(completeCourse, /if \(afterUnit\) await afterUnit\(\{ course, unit \}\)/);
  assert.match(deepCourse, /Number\(unit\.unit_index\) !== 5/);
  assert.match(deepCourse, /afterUnit:\s*async/);
  assert.match(deepCourse, /courseState === 'in_progress'/);
});
