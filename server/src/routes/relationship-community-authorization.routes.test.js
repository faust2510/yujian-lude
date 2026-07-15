import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import communityRoutes from './community.routes.js';
import relationshipRoutes from './relationships.routes.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute(router, {
  method = 'GET',
  path,
  body,
  dbRows,
  userId = USER_ID,
  userRole = 'user',
}) {
  const calls = [];
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const execute = async (sql, params = []) => {
    const compact = compactSql(sql);
    calls.push({ sql: compact, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compact)) return { rows: [] };
    return { rows: await dbRows(compact, params) };
  };
  pool.query = execute;
  pool.connect = async () => ({ query: execute, release() {} });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, role: userRole };
    next();
  });
  app.use(router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { error: responseText };
    }
    return {
      status: response.status,
      body: responseBody,
      calls,
    };
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function relationshipDb({
  targetExists = true,
  mutual = true,
  channel = true,
  channelOpen = true,
  existingEnded = false,
} = {}) {
  return async (sql) => {
    if (/FROM app_settings/i.test(sql)) return [];
    if (/FROM users/i.test(sql)) return targetExists ? [{ id: PARTNER_ID }] : [];

    const checksMatches = /\bmatches\b/i.test(sql);
    const checksChannel = /\bchat_channels\b/i.test(sql);
    if (checksMatches || checksChannel) {
      const filtersClosedChannels = /c\.closed_at IS NULL/i.test(sql);
      const channelMatches = channel && (channelOpen || !filtersClosedChannels);
      const authorized = (!checksMatches || mutual) && (!checksChannel || channelMatches);
      return authorized ? [{ ok: 1 }] : [];
    }

    if (/FROM course_exam_attempts/i.test(sql)) return [{ ok: 1 }];
    if (/FROM relationships/i.test(sql)) {
      if (existingEnded && !/state\s*<>\s*'ended'/i.test(sql)) {
        return [{ id: 'ended-relationship', user_a: USER_ID, user_b: PARTNER_ID, state: 'ended' }];
      }
      return [];
    }
    if (/INSERT INTO relationships/i.test(sql)) {
      return [{ id: 'relationship-1', user_a: USER_ID, user_b: PARTNER_ID, state: 'initiated' }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('relationship initiation rejects the current user as partner', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: USER_ID },
    dbRows: relationshipDb(),
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /自己|本人/);
  assert.equal(result.calls.length, 0);
});

test('relationship initiation returns 404 when the target user does not exist', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: PARTNER_ID },
    dbRows: relationshipDb({ targetExists: false }),
  });

  assert.equal(result.status, 404);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO relationships/i.test(sql)), false);
});

test('relationship initiation rejects a target without a mutual match', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: PARTNER_ID },
    dbRows: relationshipDb({ mutual: false, channel: true }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO relationships/i.test(sql)), false);
});

test('relationship initiation rejects a mutual match without a chat channel', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: PARTNER_ID },
    dbRows: relationshipDb({ mutual: true, channel: false }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO relationships/i.test(sql)), false);
});

test('relationship initiation rejects a mutual match whose chat channel is closed', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: PARTNER_ID },
    dbRows: relationshipDb({ channelOpen: false }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO relationships/i.test(sql)), false);
});

test('relationship initiation remains available after mutual matching creates a chat channel', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: PARTNER_ID },
    dbRows: relationshipDb(),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.relationship.id, 'relationship-1');
});

test('relationship initiation creates a new lifecycle after an earlier relationship ended', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/initiate',
    body: { partner_id: PARTNER_ID },
    dbRows: relationshipDb({ existingEnded: true }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.relationship.id, 'relationship-1');
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO relationships/i.test(sql)), true);
});

const REVIEWER_ID = '55555555-5555-4555-8555-555555555555';

function relationshipReviewDb({ linkedReviewerId = null } = {}) {
  return async (sql) => {
    if (/WITH pending_sides/i.test(sql)) {
      return linkedReviewerId ? [{
        relationship_id: '66666666-6666-4666-8666-666666666666',
        side: 'user_a',
        subject_id: USER_ID,
        subject_nickname: '待审核用户',
        endorsement_id: '77777777-7777-4777-8777-777777777777',
        endorsement_name: '测试引荐人',
        endorsement_kind: 'referrer',
      }] : [];
    }
    if (/SELECT \* FROM relationships/i.test(sql)) {
      return [{
        id: '66666666-6666-4666-8666-666666666666',
        user_a: USER_ID,
        user_b: PARTNER_ID,
        state: 'mutual_confirmed',
        user_a_confirmed: true,
        user_b_confirmed: true,
        pastor_a_approved: false,
        pastor_b_approved: false,
      }];
    }
    if (/UPDATE relationships/i.test(sql)) {
      return [{
        id: '66666666-6666-4666-8666-666666666666',
        user_a: USER_ID,
        user_b: PARTNER_ID,
        state: 'pastoral_review',
        user_a_confirmed: true,
        user_b_confirmed: true,
        pastor_a_approved: true,
        pastor_b_approved: false,
      }];
    }
    if (/FROM endorsements/i.test(sql)) {
      if (!linkedReviewerId) return [];
      return [{
        id: '77777777-7777-4777-8777-777777777777',
        user_id: USER_ID,
        endorser_user_id: linkedReviewerId,
        kind: 'referrer',
        state: 'verified',
      }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('a linked referrer can approve only their assigned relationship side', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/66666666-6666-4666-8666-666666666666/pastor-approve',
    body: { side: 'user_a' },
    userId: REVIEWER_ID,
    userRole: 'user',
    dbRows: relationshipReviewDb({ linkedReviewerId: REVIEWER_ID }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.relationship.pastor_a_approved, true);
});

test('a pastor without a verified endorsement link cannot approve a relationship side', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/66666666-6666-4666-8666-666666666666/pastor-approve',
    body: { side: 'user_a' },
    userId: REVIEWER_ID,
    userRole: 'pastor',
    dbRows: relationshipReviewDb(),
  });

  assert.equal(result.status, 403);
});

test('relationship participants cannot approve their own pastoral review', async () => {
  const result = await requestRoute(relationshipRoutes, {
    method: 'POST',
    path: '/relationships/66666666-6666-4666-8666-666666666666/pastor-approve',
    body: { side: 'user_a' },
    userId: USER_ID,
    userRole: 'admin',
    dbRows: relationshipReviewDb({ linkedReviewerId: USER_ID }),
  });

  assert.equal(result.status, 403);
});

test('linked referrers can list their pending relationship reviews', async () => {
  const result = await requestRoute(relationshipRoutes, {
    path: '/relationship-reviews',
    userId: REVIEWER_ID,
    userRole: 'user',
    dbRows: relationshipReviewDb({ linkedReviewerId: REVIEWER_ID }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.reviews.length, 1);
  assert.equal(result.body.reviews[0].side, 'user_a');
});

function communityDb({ groupExists = true, eventExists = true, member = true } = {}) {
  return async (sql) => {
    if (/FROM community_groups/i.test(sql)) return groupExists ? [{ id: GROUP_ID }] : [];
    if (/FROM community_memberships/i.test(sql)) {
      return member ? [{ role: 'member', state: 'approved' }] : [];
    }
    if (/FROM community_events/i.test(sql)) {
      if (/WHERE id = \$1/i.test(sql)) {
        return eventExists ? [{ id: EVENT_ID, group_id: GROUP_ID, max_attendees: null }] : [];
      }
      return [{ id: EVENT_ID, group_id: GROUP_ID, title: '小组活动' }];
    }
    if (/COUNT\(\*\).*community_event_rsvps/i.test(sql)) return [{ c: 0 }];
    if (/INSERT INTO community_event_rsvps/i.test(sql)) return [];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('group event details return 404 when the group does not exist', async () => {
  const result = await requestRoute(communityRoutes, {
    path: `/community/groups/${GROUP_ID}/events`,
    dbRows: communityDb({ groupExists: false }),
  });

  assert.equal(result.status, 404);
});

test('group event details reject a non-member', async () => {
  const result = await requestRoute(communityRoutes, {
    path: `/community/groups/${GROUP_ID}/events`,
    dbRows: communityDb({ member: false }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /FROM community_events/i.test(sql)), false);
});

test('group event details remain available to an approved member', async () => {
  const result = await requestRoute(communityRoutes, {
    path: `/community/groups/${GROUP_ID}/events`,
    dbRows: communityDb(),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.events[0].id, EVENT_ID);
});

test('event RSVP returns 404 when the event does not exist', async () => {
  const result = await requestRoute(communityRoutes, {
    method: 'POST',
    path: `/community/events/${EVENT_ID}/rsvp`,
    body: { status: 'going' },
    dbRows: communityDb({ eventExists: false }),
  });

  assert.equal(result.status, 404);
});

test('event RSVP rejects a non-member of the event group', async () => {
  const result = await requestRoute(communityRoutes, {
    method: 'POST',
    path: `/community/events/${EVENT_ID}/rsvp`,
    body: { status: 'going' },
    dbRows: communityDb({ member: false }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.calls.some(({ sql }) => /INSERT INTO community_event_rsvps/i.test(sql)), false);
});

test('event RSVP remains available to an approved member', async () => {
  const result = await requestRoute(communityRoutes, {
    method: 'POST',
    path: `/community/events/${EVENT_ID}/rsvp`,
    body: { status: 'going' },
    dbRows: communityDb(),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, status: 'going' });
  assert.equal(result.calls.some(({ sql }) => /FROM community_events[\s\S]*FOR UPDATE/i.test(sql)), true);
  assert.equal(result.calls.some(({ sql }) => sql === 'BEGIN'), true);
  assert.equal(result.calls.some(({ sql }) => sql === 'COMMIT'), true);
});

test('event RSVP rejects unsupported statuses before opening a transaction', async () => {
  const result = await requestRoute(communityRoutes, {
    method: 'POST',
    path: `/community/events/${EVENT_ID}/rsvp`,
    body: { status: 'approved' },
    dbRows: communityDb(),
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /status/);
  assert.equal(result.calls.length, 0);
});
