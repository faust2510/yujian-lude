import assert from 'node:assert/strict';
import test from 'node:test';
import { distributeChapterIndexes } from './textbook-bindings.js';

test('distributeChapterIndexes puts overflow chapters on first and last units', () => {
  assert.deepEqual(distributeChapterIndexes(12, 10), [[1, 2], [3], [4], [5], [6], [7], [8], [9], [10], [11, 12]]);
});

test('distributeChapterIndexes leaves later units empty when chapters are fewer than units', () => {
  assert.deepEqual(distributeChapterIndexes(3, 5), [[1], [2], [3], [], []]);
});
