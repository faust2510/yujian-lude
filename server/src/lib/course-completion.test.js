import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCourseState, shouldGrantCourseCompletionRewards } from './course-completion.js';

test('light course completes after all units are passed without pastor nodes', () => {
  assert.equal(
    computeCourseState({ unitsDone: 4, totalUnits: 4, pastorConfirmed: 0, pastorNodeCount: 0 }),
    'completed'
  );
});

test('deep course waits for pastor review when pastor nodes are not confirmed', () => {
  assert.equal(
    computeCourseState({ unitsDone: 10, totalUnits: 10, pastorConfirmed: 1, pastorNodeCount: 2 }),
    'pastor_review'
  );
});

test('course remains in progress until all units are passed', () => {
  assert.equal(
    computeCourseState({ unitsDone: 3, totalUnits: 4, pastorConfirmed: 0, pastorNodeCount: 0 }),
    'in_progress'
  );
});

test('light match-gate course does not grant deep course rewards', () => {
  assert.equal(
    shouldGrantCourseCompletionRewards({ courseId: 'light', lightCourseId: 'light' }),
    false
  );
  assert.equal(
    shouldGrantCourseCompletionRewards({ courseId: 'deep', lightCourseId: 'light' }),
    true
  );
});
