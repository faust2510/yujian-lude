import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateProfileCompletion,
  normalizeBaptismDate,
  normalizeFaithYears,
} from './profile-inputs.js';
import * as profileInputs from './profile-inputs.js';

const completeProfile = {
  nickname: '路得',
  city: '上海',
  birth_date: '1994-07-16',
  education: '本科',
  goal: 'serious',
  preference: '愿意共同成长',
  intro: '认真预备婚姻',
  privacy_ok: true,
};

test('profile reaches 100 percent only after privacy consent', () => {
  assert.equal(calculateProfileCompletion(completeProfile), 100);
  assert.equal(calculateProfileCompletion({ ...completeProfile, privacy_ok: false }), 88);
});

test('profile completion ignores blank text values', () => {
  assert.equal(calculateProfileCompletion({ ...completeProfile, intro: '   ' }), 88);
});

test('normalizes flexible baptism dates before database writes', () => {
  assert.equal(normalizeBaptismDate('2021'), '2021-01-01');
  assert.equal(normalizeBaptismDate('2018-05'), '2018-05-01');
  assert.equal(normalizeBaptismDate('2018-05-13'), '2018-05-13');
  assert.equal(normalizeBaptismDate(''), null);
  assert.equal(normalizeBaptismDate(null), null);
});

test('rejects baptism dates that cannot be stored as dates', () => {
  assert.throws(
    () => normalizeBaptismDate('2021-99'),
    /受洗时间格式/
  );
  assert.throws(
    () => normalizeBaptismDate('not-a-date'),
    /受洗时间格式/
  );
});

test('normalizes optional faith years before database writes', () => {
  assert.equal(normalizeFaithYears('6'), 6);
  assert.equal(normalizeFaithYears(3), 3);
  assert.equal(normalizeFaithYears(''), null);
  assert.equal(normalizeFaithYears(undefined), null);
});

test('rejects faith years that cannot be stored as an integer', () => {
  assert.throws(
    () => normalizeFaithYears('六年'),
    /信主年数/
  );
  assert.throws(
    () => normalizeFaithYears('-1'),
    /信主年数/
  );
});

test('strictly normalizes complete adult birth dates using the Asia Shanghai day boundary', () => {
  assert.equal(typeof profileInputs.normalizeBirthDate, 'function');
  const now = new Date('2026-07-14T16:00:00.000Z');

  assert.equal(profileInputs.normalizeBirthDate('2008-07-15', now), '2008-07-15');
  assert.equal(profileInputs.normalizeBirthDate('1994-02-28', now), '1994-02-28');
  assert.equal(profileInputs.normalizeBirthDate('', now), null);
  assert.equal(profileInputs.normalizeBirthDate(null, now), null);

  for (const value of [
    '2008-07-16',
    '2026-07-16',
    '1939-12-31',
    '2008-02-30',
    '2008-7-15',
    '2008',
  ]) {
    assert.throws(
      () => profileInputs.normalizeBirthDate(value, now),
      /出生日期|年满 18 周岁/
    );
  }
});

test('profile completion requires a complete birth date rather than a compatible birth year', () => {
  assert.equal(calculateProfileCompletion({ ...completeProfile, birth_date: null, birth_year: 1994 }), 88);
});
