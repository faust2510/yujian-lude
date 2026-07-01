import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBaptismDate, normalizeFaithYears } from './profile-inputs.js';

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
