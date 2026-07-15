import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchQualification } from './match-qualification.js';

test('verified referrer satisfies the endorsement gate', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      baptism_date: '2018-05-01',
      faith_years: 8,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'referrer', state: 'verified' }],
    lightCourseCompleted: true,
  });

  assert.equal(status.inPool, true);
  assert.equal(status.endorsementVerified, true);
  assert.deepEqual(status.missing, []);
});

test('faith profile stays incomplete until all displayed gate fields are filled', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '',
      baptism_date: '2018-05-01',
      faith_years: 8,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
  });

  assert.equal(status.faithProfileComplete, false);
  assert.deepEqual(status.missing, ['faithProfile']);
});

test('faith profile accepts the Date object returned by PostgreSQL', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      baptism_date: new Date('2018-05-01T00:00:00.000Z'),
      faith_years: 8,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
  });

  assert.equal(status.faithProfileComplete, true);
});

test('qualification reports concrete missing actions', () => {
  const status = buildMatchQualification({
    profile: { completion: 40, privacy_ok: false },
    faith: null,
    faithTestPassed: false,
    endorsements: [{ kind: 'pastor', state: 'pending' }],
    lightCourseCompleted: false,
  });

  assert.equal(status.inPool, false);
  assert.deepEqual(status.missing, [
    'profile',
    'faithProfile',
    'faithTest',
    'endorsement',
    'lightCourse',
  ]);
  assert.equal(status.nextActions[0].to, '/profile');
});

test('completed profile stays outside the pool when the birth year is underage', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_year: 2009 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      baptism_date: '2024-05-01',
      faith_years: 2,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
    now: new Date('2026-07-15T00:00:00.000Z'),
  });

  assert.equal(status.profileComplete, false);
  assert.equal(status.inPool, false);
  assert.deepEqual(status.missing, ['profile']);
});

test('qualification describes the year-based adult policy without claiming exact birthday verification', () => {
  const status = buildMatchQualification({
    profile: null,
    faith: null,
    faithTestPassed: false,
    endorsements: [],
    lightCourseCompleted: false,
  });

  assert.match(status.gate, /出生年份符合平台成年范围/);
  assert.doesNotMatch(status.gate, /年满 18 周岁/);
});
