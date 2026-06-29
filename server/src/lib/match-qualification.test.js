import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMatchQualification } from './match-qualification.js';

test('verified referrer satisfies the endorsement gate', () => {
  const status = buildMatchQualification({
    profile: { completion: 100, privacy_ok: true },
    faith: { church_name: '湾区教会', testimony: '愿意认真预备婚姻。' },
    faithTestPassed: true,
    endorsements: [{ kind: 'referrer', state: 'verified' }],
    lightCourseCompleted: true,
  });

  assert.equal(status.inPool, true);
  assert.equal(status.endorsementVerified, true);
  assert.deepEqual(status.missing, []);
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
