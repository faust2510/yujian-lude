import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMatchIntent, statusForIntent } from './match-intent.js';

test('normalizes supported match intents', () => {
  assert.equal(normalizeMatchIntent(undefined), 'like');
  assert.equal(normalizeMatchIntent('like'), 'like');
  assert.equal(normalizeMatchIntent('pass'), 'pass');
  assert.equal(normalizeMatchIntent('skip'), null);
});

test('maps intents to persisted match statuses', () => {
  assert.equal(statusForIntent('like'), 'intent_sent');
  assert.equal(statusForIntent('pass'), 'declined');
});
