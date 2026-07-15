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

test('deep course enters midterm pastor review as soon as the first pastor node is completed', () => {
  assert.equal(
    computeCourseState({
      unitsDone: 5,
      totalUnits: 10,
      pastorConfirmed: 0,
      pastorNodeCount: 2,
      pastorNodeIndexes: [5, 10],
      examPassed: false,
    }),
    'pastor_review'
  );
});

test('deep course cannot complete from pastor approvals until the final exam is passed', () => {
  assert.equal(
    computeCourseState({
      unitsDone: 10,
      totalUnits: 10,
      pastorConfirmed: 2,
      pastorNodeCount: 2,
      pastorNodeIndexes: [5, 10],
      examPassed: false,
    }),
    'pastor_review'
  );
});

test('completed is a terminal course state even when unit progress is submitted again', () => {
  assert.equal(
    computeCourseState({
      currentState: 'completed',
      unitsDone: 5,
      totalUnits: 10,
      pastorConfirmed: 2,
      pastorNodeCount: 2,
      pastorNodeIndexes: [5, 10],
      examPassed: false,
    }),
    'completed'
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
