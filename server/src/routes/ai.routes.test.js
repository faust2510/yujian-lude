import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { pool } from '../db.js';
import aiRoutes from './ai.routes.js';

const USER_A_ID = '11111111-1111-4111-8111-111111111111';
const USER_B_ID = '22222222-2222-4222-8222-222222222222';

test.after(async () => {
  await pool.end();
});

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function requestRoute({
  method = 'GET',
  path,
  body,
  userId = USER_A_ID,
  dbRows = async () => [],
}) {
  const calls = [];
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const run = async (sql, params = []) => {
    calls.push({ sql: compactSql(sql), params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(compactSql(sql))) return { rows: [] };
    return { rows: await dbRows(compactSql(sql), params) };
  };
  pool.query = run;
  pool.connect = async () => ({
    query: run,
    release() {},
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, role: 'free', is_banned: false };
    next();
  });
  app.use(aiRoutes);
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error.message });
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
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('AI 提问拒绝超过 2000 个字符的输入且不访问数据库', async () => {
  const result = await requestRoute({
    method: 'POST',
    path: '/ai/ask',
    body: { question: '问'.repeat(2001) },
    dbRows: async () => {
      throw new Error('database should not be called');
    },
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /2000/);
  assert.equal(result.calls.length, 0);
});

test('AI 提问按用户限制为 60 秒内 10 次', async () => {
  const counts = new Map();
  const dbRows = async (sql, params) => {
    const userId = params[0];
    if (/pg_advisory_xact_lock/i.test(sql)) return [];
    if (/SELECT COUNT\(\*\)/i.test(sql)) return [{ count: counts.get(userId) || 0 }];
    if (/INSERT INTO ai_consultations/i.test(sql)) {
      counts.set(userId, (counts.get(userId) || 0) + 1);
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const userAResponses = [];
  for (let index = 0; index < 11; index += 1) {
    userAResponses.push(await requestRoute({
      method: 'POST',
      path: '/ai/ask',
      userId: USER_A_ID,
      body: { question: `用户 A 的问题 ${index + 1}` },
      dbRows,
    }));
  }
  const userBResponse = await requestRoute({
    method: 'POST',
    path: '/ai/ask',
    userId: USER_B_ID,
    body: { question: '用户 B 的第一个问题' },
    dbRows,
  });

  assert.ok(userAResponses.slice(0, 10).every(({ status }) => status === 200));
  assert.equal(userAResponses[10].status, 429);
  assert.match(userAResponses[10].body.error, /频繁|稍后/);
  assert.equal(userBResponse.status, 200);
  assert.equal(counts.get(USER_A_ID), 10);
  assert.equal(counts.get(USER_B_ID), 1);
  assert.deepEqual(userAResponses[0].calls.map(({ sql }) => {
    if (/pg_advisory_xact_lock/i.test(sql)) return 'LOCK_USER';
    if (/SELECT COUNT\(\*\)/i.test(sql)) return 'COUNT_WINDOW';
    if (/INSERT INTO ai_consultations/i.test(sql)) return 'INSERT';
    return sql;
  }), ['BEGIN', 'LOCK_USER', 'COUNT_WINDOW', 'INSERT', 'COMMIT']);
  assert.deepEqual(userAResponses[0].calls[1].params, [`ai-consultation:${USER_A_ID}`]);
  assert.equal(
    userAResponses[10].calls.some(({ sql }) => /INSERT INTO ai_consultations/i.test(sql)),
    false
  );
  assert.equal(userAResponses[10].calls.at(-1).sql, 'COMMIT');
});

test('AI 历史只返回当前认证用户的记录', async () => {
  const result = await requestRoute({
    path: '/ai/history',
    userId: USER_A_ID,
    dbRows: async (sql, params) => {
      assert.match(sql, /FROM ai_consultations WHERE user_id = \$1/i);
      assert.deepEqual(params, [USER_A_ID]);
      return [
        {
          user_id: USER_A_ID,
          question: '用户 A 的历史',
          answer: 'A 的回答',
          out_of_scope: false,
          created_at: '2026-07-15T01:00:00.000Z',
        },
        {
          user_id: USER_B_ID,
          question: '用户 B 的历史',
          answer: 'B 的回答',
          out_of_scope: false,
          created_at: '2026-07-15T00:00:00.000Z',
        },
      ];
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.history, [{
    question: '用户 A 的历史',
    answer: 'A 的回答',
    out_of_scope: false,
    created_at: '2026-07-15T01:00:00.000Z',
  }]);
});
