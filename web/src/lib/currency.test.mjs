import assert from 'node:assert/strict'
import test from 'node:test'

import { formatCurrencyAmount } from './currency.js'

const normalized = value => value.replace(/\s+/g, ' ')

test('formats configured currencies without hardcoding the yuan symbol', () => {
  assert.equal(normalized(formatCurrencyAmount(29, 'CNY')), 'CNY 29.00')
  assert.equal(normalized(formatCurrencyAmount(29, 'USD')), 'USD 29.00')
  assert.equal(formatCurrencyAmount(Number.NaN, 'CNY'), '—')
});
