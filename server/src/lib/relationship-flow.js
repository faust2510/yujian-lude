export const RELATIONSHIP_STATES = {
  CHATTING: 'chatting',
  REQUESTED: 'relationship_requested',
  MUTUAL_CONFIRMED: 'mutual_confirmed',
  PASTORAL_REVIEW: 'pastoral_review',
  CONFIRMED: 'confirmed',
  ENDED: 'ended',
};

function assertActive(rel) {
  if (!rel || rel.state === RELATIONSHIP_STATES.ENDED) throw new Error('relationship is not active');
}

function participantSide(rel, userId) {
  if (rel.user_a === userId) return 'a';
  if (rel.user_b === userId) return 'b';
  throw new Error('not a participant');
}

export function confirmRelationshipParticipant(rel, userId, now = new Date()) {
  assertActive(rel);
  const side = participantSide(rel, userId);
  const next = { ...rel };
  const timestamp = now.toISOString();

  if (!next.confirmation_requested_by) {
    next.confirmation_requested_by = userId;
    next.confirmation_requested_at = timestamp;
  }

  if (side === 'a') {
    next.user_a_confirmed = true;
    next.user_a_confirmed_at = next.user_a_confirmed_at || timestamp;
  } else {
    next.user_b_confirmed = true;
    next.user_b_confirmed_at = next.user_b_confirmed_at || timestamp;
  }

  if (next.user_a_confirmed && next.user_b_confirmed) {
    next.state = RELATIONSHIP_STATES.MUTUAL_CONFIRMED;
  } else {
    next.state = RELATIONSHIP_STATES.REQUESTED;
  }

  return next;
}

export function approveRelationshipPastorSide(rel, side, now = new Date()) {
  assertActive(rel);
  if (!['user_a', 'user_b'].includes(side)) throw new Error('invalid pastor approval side');
  const next = { ...rel };

  if (side === 'user_a') next.pastor_a_approved = true;
  if (side === 'user_b') next.pastor_b_approved = true;

  if (next.user_a_confirmed && next.user_b_confirmed && next.pastor_a_approved && next.pastor_b_approved) {
    next.state = RELATIONSHIP_STATES.CONFIRMED;
    next.confirmed_at = next.confirmed_at || now.toISOString();
  } else if (next.user_a_confirmed && next.user_b_confirmed) {
    next.state = RELATIONSHIP_STATES.PASTORAL_REVIEW;
  }

  return next;
}

export function endRelationship(rel, reason = '', now = new Date()) {
  assertActive(rel);
  return {
    ...rel,
    state: RELATIONSHIP_STATES.ENDED,
    ended_at: now.toISOString(),
    ended_reason: String(reason || '').trim() || null,
  };
}
