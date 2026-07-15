import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchQualification } from './match-qualification.js';

test('verified referrer satisfies the endorsement gate', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_date: '1994-07-16', birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      region: '上海',
      denomination: '长老会',
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
    profile: { completion: 100, privacy_ok: true, birth_date: '1994-07-16', birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '',
      region: '上海',
      denomination: '长老会',
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
    profile: { completion: 100, privacy_ok: true, birth_date: '1994-07-16', birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      region: '上海',
      denomination: '长老会',
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

test('faith profile requires both region and denomination before entering the pool', () => {
  const baseFaith = {
    church_name: '湾区教会',
    presbytery: '中华联合区会',
    region: '上海',
    denomination: '长老会',
    baptism_date: '2018-05-01',
    faith_years: 8,
    testimony: '愿意认真预备婚姻。',
  };
  const qualification = (faith) => buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_date: '1994-07-16' },
    faith,
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
  });

  assert.equal(qualification({ ...baseFaith, region: ' ' }).faithProfileComplete, false);
  assert.equal(qualification({ ...baseFaith, denomination: '' }).faithProfileComplete, false);
  assert.equal(qualification(baseFaith).faithProfileComplete, true);
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

test('completed profile stays outside the pool until its exact eighteenth birthday', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_date: '2008-07-16', birth_year: 2008 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      region: '上海',
      denomination: '长老会',
      baptism_date: '2024-05-01',
      faith_years: 2,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
    now: new Date('2026-07-15T15:59:59.999Z'),
  });

  assert.equal(status.profileComplete, false);
  assert.equal(status.inPool, false);
  assert.deepEqual(status.missing, ['profile']);
});

test('a user becomes eligible at midnight on their eighteenth birthday in Asia Shanghai', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_date: '2008-07-16', birth_year: 2008 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      region: '上海',
      denomination: '长老会',
      baptism_date: '2024-05-01',
      faith_years: 2,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
    now: new Date('2026-07-15T16:00:00.000Z'),
  });

  assert.equal(status.profileComplete, true);
  assert.equal(status.inPool, true);
});

test('qualification describes the exact birthday policy', () => {
  const status = buildMatchQualification({
    profile: null,
    faith: null,
    faithTestPassed: false,
    endorsements: [],
    lightCourseCompleted: false,
  });

  assert.match(status.gate, /年满 18 周岁/);
  assert.match(status.gate, /出生日期/);
  assert.match(status.gate, /地区、宗派/);
});

test('a legacy profile with only birth_year remains outside the pool and is prompted to add birth date', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      region: '上海',
      denomination: '长老会',
      baptism_date: '2018-05-01',
      faith_years: 8,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
  });

  assert.equal(status.profileComplete, false);
  assert.equal(status.inPool, false);
  assert.deepEqual(status.missing, ['profile']);
  assert.match(status.nextActions[0].label, /出生日期/);
});

test('an active relationship explicitly blocks an otherwise qualified profile with a next action', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true, birth_date: '1994-07-16', birth_year: 1994 },
    faith: {
      church_name: '湾区教会',
      presbytery: '中华联合区会',
      region: '上海',
      denomination: '长老会',
      baptism_date: '2018-05-01',
      faith_years: 8,
      testimony: '愿意认真预备婚姻。',
    },
    faithTestPassed: true,
    endorsements: [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted: true,
    relationshipBlocked: true,
  });

  assert.equal(status.inPool, false);
  assert.equal(status.relationshipBlocked, true);
  assert.deepEqual(status.missing, ['relationship']);
  assert.deepEqual(status.nextActions.map((item) => item.key), ['relationship']);
});
