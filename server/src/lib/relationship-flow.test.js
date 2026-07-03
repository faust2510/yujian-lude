import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approveRelationshipPastorSide,
  confirmRelationshipParticipant,
  endRelationship,
} from './relationship-flow.js';

const baseRelationship = {
  id: 'rel-1',
  user_a: 'user-a',
  user_b: 'user-b',
  state: 'chatting',
  user_a_confirmed: false,
  user_b_confirmed: false,
  pastor_a_approved: false,
  pastor_b_approved: false,
};

test('first participant confirmation moves relationship to requested', () => {
  const rel = confirmRelationshipParticipant(baseRelationship, 'user-a', new Date('2026-07-03T00:00:00Z'));

  assert.equal(rel.state, 'relationship_requested');
  assert.equal(rel.user_a_confirmed, true);
  assert.equal(rel.user_b_confirmed, false);
  assert.equal(rel.confirmation_requested_by, 'user-a');
});

test('second participant confirmation moves relationship to mutual confirmed', () => {
  const requested = confirmRelationshipParticipant(baseRelationship, 'user-a', new Date('2026-07-03T00:00:00Z'));
  const mutual = confirmRelationshipParticipant(requested, 'user-b', new Date('2026-07-03T00:01:00Z'));

  assert.equal(mutual.state, 'mutual_confirmed');
  assert.equal(mutual.user_a_confirmed, true);
  assert.equal(mutual.user_b_confirmed, true);
});

test('pastoral approvals confirm only after both sides are approved', () => {
  const mutual = {
    ...baseRelationship,
    state: 'pastoral_review',
    user_a_confirmed: true,
    user_b_confirmed: true,
  };
  const oneSide = approveRelationshipPastorSide(mutual, 'user_a', new Date('2026-07-03T00:02:00Z'));
  const bothSides = approveRelationshipPastorSide(oneSide, 'user_b', new Date('2026-07-03T00:03:00Z'));

  assert.equal(oneSide.state, 'pastoral_review');
  assert.equal(bothSides.state, 'confirmed');
  assert.ok(bothSides.confirmed_at);
});

test('ending a relationship records ended state and reason', () => {
  const ended = endRelationship(baseRelationship, '双方决定暂停继续了解', new Date('2026-07-03T00:04:00Z'));

  assert.equal(ended.state, 'ended');
  assert.equal(ended.ended_reason, '双方决定暂停继续了解');
  assert.ok(ended.ended_at);
});

test('non-participants cannot confirm relationship', () => {
  assert.throws(
    () => confirmRelationshipParticipant(baseRelationship, 'stranger'),
    /not a participant/
  );
});
