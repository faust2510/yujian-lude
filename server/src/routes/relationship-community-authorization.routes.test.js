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

async function requestRoute(router, { method = 'GET', path, body, dbRows, userId = USER_ID }) {
  const calls = [];
  const originalQuery = pool.query;
  pool.query = async (sql, params = []) => {
    const compact = compactSql(sql);
    calls.push({ sql: compact, params });
    return { rows: await dbRows(compact, params) };
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, role: 'user' };
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
    return {
      status: response.status,
      body: await response.json(),
      calls,
    };
  } finally {
    pool.query = originalQuery;
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function relationshipDb({ targetExists = true, mutual = true, channel = true, channelOpen = true } = {}) {
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
    if (/FROM relationships/i.test(sql)) return [];
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
});
