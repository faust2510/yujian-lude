import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pg from 'pg';
import { QUESTIONS } from '../lib/faith-questions.js';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const USER_ID = '11111111-1111-4111-8111-111111111111';

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

function correctAnswers() {
  return QUESTIONS.map(({ id, answer }) => ({ id, a: answer }));
}

function failedAnswers() {
  return correctAnswers().map((answer) => ({ ...answer, a: answer.a === 'A' ? 'B' : 'A' }));
}

test('concurrent faith submissions receive unique attempts and a later failure preserves qualification', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `faith_test_concurrency_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);

    const { pool } = await import('../db.js');
    const { default: faithTestRoutes } = await import('./faith-test.routes.js');
    appPool = pool;

    await pool.query(`
      CREATE TABLE faith_tests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        score SMALLINT NOT NULL,
        passed BOOLEAN NOT NULL,
        answers JSONB,
        attempt_no SMALLINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, attempt_no)
      );
    `);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: USER_ID, role: 'free' };
      next();
    });
    app.use(faithTestRoutes);
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });
    server = await listen(app);

    const endpoint = `http://127.0.0.1:${server.address().port}/faith-test/submit`;
    const submit = (answers) => fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    });

    const responses = await Promise.all(Array.from({ length: 8 }, () => submit(correctAnswers())));
    assert.ok(responses.every(({ status }) => status === 200));
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies.map(({ attemptNo }) => attemptNo).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);

    const retake = await submit(failedAnswers());
    assert.equal(retake.status, 200);
    const retakeBody = await retake.json();
    assert.equal(retakeBody.attemptNo, 9);
    assert.equal(retakeBody.passed, false);
    assert.equal(retakeBody.qualified, true);

    const attempts = await pool.query(
      'SELECT attempt_no FROM faith_tests WHERE user_id = $1 ORDER BY attempt_no',
      [USER_ID],
    );
    assert.deepEqual(attempts.rows.map(({ attempt_no }) => attempt_no), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
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
