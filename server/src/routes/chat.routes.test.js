import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import chatRoutes from './chat.routes.js';

const THIRD_PARTY_ID = '11111111-1111-4111-8111-111111111111';
const USER_A_ID = '22222222-2222-4222-8222-222222222222';
const USER_B_ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_ID = '44444444-4444-4444-8444-444444444444';

test.after(async () => {
  await pool.end();
});

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function postMessage(dbRows, { channelId = CHANNEL_ID, body = { body: '越权消息' } } = {}) {
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
    req.user = { id: THIRD_PARTY_ID, role: 'free', is_banned: false };
    next();
  });
  app.use(chatRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/chat/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return { status: response.status, body: await response.json(), calls };
  } finally {
    pool.query = originalQuery;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('非法频道 ID 和非字符串消息在查询数据库前返回 400', async () => {
  for (const request of [
    { channelId: 'not-a-uuid', body: { body: '消息' } },
    { channelId: CHANNEL_ID, body: { body: { nested: true } } },
    { channelId: CHANNEL_ID, body: { body: 'x'.repeat(2001) } },
  ]) {
    const result = await postMessage(
      async (sql) => { throw new Error(`Unexpected SQL: ${sql}`); },
      request,
    );
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
});

test('第三方用户向他人频道发送消息时返回 403 且不落库', async () => {
  let persistedMessages = 0;
  const result = await postMessage(async (sql) => {
    if (/FROM chat_channels/i.test(sql)) return [];
    if (/INSERT INTO chat_messages/i.test(sql)) {
      persistedMessages += 1;
      return [{ id: 'message-id' }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  assert.equal(result.status, 403);
  assert.equal(persistedMessages, 0);
});

test('成员校验后被撤权时写入仍返回 403 且不落库', async () => {
  let persistedMessages = 0;
  const result = await postMessage(async (sql) => {
    if (/^SELECT .* FROM chat_channels/i.test(sql)) {
      return [{ id: CHANNEL_ID, user_a: USER_A_ID, user_b: USER_B_ID }];
    }
    if (/INSERT INTO chat_messages/i.test(sql)) {
      const writeChecksMembership = /FROM chat_channels/i.test(sql)
        && /user_a\s*=\s*\$2\s+OR\s+user_b\s*=\s*\$2/i.test(sql);
      if (writeChecksMembership) return [];
      persistedMessages += 1;
      return [{ id: 'message-id', sender_id: THIRD_PARTY_ID, body: '越权消息' }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  assert.equal(result.status, 403);
  assert.equal(persistedMessages, 0);
});
