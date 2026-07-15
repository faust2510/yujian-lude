import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function close(server) {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('a one-seat event accepts exactly one of two concurrent RSVPs', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `community_rsvp_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);

    const { pool } = await import('../db.js');
    const { default: communityRoutes } = await import('./community.routes.js');
    appPool = pool;

    await pool.query(`
      CREATE TABLE community_events (
        id UUID PRIMARY KEY,
        group_id UUID NOT NULL,
        max_attendees SMALLINT
      );
      CREATE TABLE community_memberships (
        group_id UUID NOT NULL,
        user_id UUID NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        state TEXT NOT NULL,
        PRIMARY KEY (group_id, user_id)
      );
      CREATE TABLE community_event_rsvps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL,
        user_id UUID NOT NULL,
        status TEXT NOT NULL,
        UNIQUE (event_id, user_id)
      );
    `);
    await pool.query(
      `INSERT INTO community_events (id, group_id, max_attendees) VALUES ($1, $2, 1)`,
      [EVENT_ID, GROUP_ID],
    );
    await pool.query(
      `INSERT INTO community_memberships (group_id, user_id, state)
       VALUES ($1, $2, 'approved'), ($1, $3, 'approved')`,
      [GROUP_ID, USER_A, USER_B],
    );

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: req.get('x-user-id'), role: 'free' };
      next();
    });
    app.use(communityRoutes);
    app.use((error, _req, res, _next) => {
      res.status(error.status || 500).json({ error: error.message });
    });
    server = await listen(app);

    const endpoint = `http://127.0.0.1:${server.address().port}/community/events/${EVENT_ID}/rsvp`;
    const responses = await Promise.all([USER_A, USER_B].map((userId) => fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ status: 'going' }),
    })));

    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
    const attendees = await pool.query(
      `SELECT user_id FROM community_event_rsvps WHERE event_id = $1 AND status = 'going'`,
      [EVENT_ID],
    );
    assert.equal(attendees.rowCount, 1);
  } finally {
    await close(server);
    if (appPool) await appPool.end();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
