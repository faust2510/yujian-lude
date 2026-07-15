import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMatchFilters } from './match-filters.js';

test('normalizes valid public age city and denomination filters', () => {
  const result = normalizeMatchFilters({
    min_age: '25',
    max_age: '38',
    city: ' 上海 ',
    denomination: ' 长老会 ',
  }, { isVip: false });
  assert.deepEqual(result, {
    ok: true,
    filters: { minAge: 25, maxAge: 38, city: '上海', denomination: '长老会' },
  });
});

test('rejects malformed, out-of-range, or reversed age filters', () => {
  for (const query of [
    { min_age: 'abc' },
    { min_age: '17' },
    { max_age: '101' },
    { min_age: '40', max_age: '30' },
  ]) {
    const result = normalizeMatchFilters(query, { isVip: false });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
});

test('non-VIP users cannot activate deep filters through crafted query strings', () => {
  const result = normalizeMatchFilters({ education: '本科' }, { isVip: false });
  assert.deepEqual(result, {
    ok: false,
    status: 403,
    error: '深度筛选仅向 VIP 开放',
    upsell: true,
  });
});

test('VIP deep filters normalize supported faith and profile fields', () => {
  const result = normalizeMatchFilters({
    education: ' 本科 ',
    goal: 'marriage',
    denomination: ' 长老会 ',
    presbytery: ' 华东区会 ',
    min_faith_years: '5',
    has_badge: 'true',
  }, { isVip: true });

  assert.deepEqual(result, {
    ok: true,
    filters: {
      education: '本科',
      goal: 'marriage',
      denomination: '长老会',
      presbytery: '华东区会',
      minFaithYears: 5,
      hasBadge: true,
    },
  });
});

test('rejects invalid deep filter values instead of leaking database errors', () => {
  for (const query of [
    { min_faith_years: '-1' },
    { min_faith_years: '2.5' },
    { has_badge: 'yes' },
    { education: 'x'.repeat(101) },
  ]) {
    const result = normalizeMatchFilters(query, { isVip: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
});
