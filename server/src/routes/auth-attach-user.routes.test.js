import assert from 'node:assert/strict';
import test from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';

import { attachUser } from '../auth.js';
import { pool } from '../db.js';
import authRoutes from './auth.routes.js';

async function requestMe(queryHandler, cookie) {
  const originalQuery = pool.query;
  pool.query = queryHandler;

  const app = express();
  app.use(cookieParser());
  app.use(attachUser);
  app.use(authRoutes);
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: '服务器内部错误' });
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/me`, {
      headers: cookie ? { cookie } : undefined,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    pool.query = originalQuery;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('auth me returns a generic 5xx when session lookup has a transient database failure', async () => {
  const result = await requestMe(async (sql) => {
    if (/FROM sessions s JOIN users u/i.test(sql)) {
      throw new Error('database connection refused: internal topology');
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }, 'yl_session=valid-looking-token');

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: '服务器内部错误' });
});

test('auth me remains anonymous without a token or without a matching session', async () => {
  const withoutToken = await requestMe(async () => {
    throw new Error('database must not be queried without a session token');
  });
  assert.equal(withoutToken.status, 200);
  assert.deepEqual(withoutToken.body, { user: null });

  const withoutSession = await requestMe(async (sql) => {
    assert.match(sql, /FROM sessions s JOIN users u/i);
    return { rows: [] };
  }, 'yl_session=expired-or-revoked');
  assert.equal(withoutSession.status, 200);
  assert.deepEqual(withoutSession.body, { user: null });
});
