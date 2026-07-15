import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { QUESTIONS } from '../lib/faith-questions.js';
import * as faithTestRoutes from './faith-test.routes.js';

function correctAnswers() {
  return QUESTIONS.map(({ id, answer }) => ({ id, a: answer }));
}

function makeDb({ passedBefore = false } = {}) {
  const inserts = [];
  const calls = [];
  return {
    inserts,
    calls,
    async one(sql) {
      if (/COUNT\(\*\)/.test(sql)) return { n: 0 };
      return null;
    },
    async tx(callback) {
      return callback({
        async query(sql, params) {
          calls.push({ sql, params });
          if (/MAX\(attempt_no\)/.test(sql)) return { rows: [{ next_attempt_no: 1 }] };
          if (/INSERT INTO faith_tests/.test(sql)) {
            inserts.push({ sql, params });
            return { rows: [] };
          }
          if (/BOOL_OR\(passed\)/.test(sql)) {
            return { rows: [{ qualified: passedBefore || Boolean(inserts.at(-1)?.params?.[2]) }] };
          }
          return { rows: [] };
        },
      });
    },
  };
}

function makeApp(db) {
  assert.equal(
    typeof faithTestRoutes.createFaithTestRouter,
    'function',
    'faith test routes must expose an injectable router factory'
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use(faithTestRoutes.createFaithTestRouter({ db }));
  return app;
}

async function submit(answers, dbOptions) {
  const db = makeDb(dbOptions);
  const app = makeApp(db);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/faith-test/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    return { status: res.status, body: await res.json(), db };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function assertRejected(answers) {
  const result = await submit(answers);
  assert.equal(result.status, 400);
  assert.equal(result.db.inserts.length, 0);
}

test('rejects duplicate question IDs', async () => {
  const answers = correctAnswers();
  answers[answers.length - 1] = { ...answers[0] };

  await assertRejected(answers);
});

test('rejects a missing question ID', async () => {
  await assertRejected(correctAnswers().slice(0, -1));
});

test('rejects an unknown question ID', async () => {
  const answers = correctAnswers();
  answers[answers.length - 1] = { id: 999, a: 'A' };

  await assertRejected(answers);
});

test('rejects an option not offered by its question', async () => {
  const answers = correctAnswers();
  answers[0] = { id: answers[0].id, a: 'E' };

  await assertRejected(answers);
});

test('accepts exactly one legal answer for every question', async () => {
  const result = await submit(correctAnswers());

  assert.equal(result.status, 200);
  assert.equal(result.body.score, QUESTIONS.length);
  assert.equal(result.body.total, QUESTIONS.length);
  assert.equal(result.body.passed, true);
  assert.equal(result.body.qualified, true);
  assert.equal(result.body.attemptNo, 1);
  assert.equal(result.db.inserts.length, 1);
  assert.equal(result.db.calls.some(({ sql }) => /pg_advisory_xact_lock/.test(sql)), true);
  assert.equal(result.db.calls.some(({ sql }) => /MAX\(attempt_no\)/.test(sql)), true);
});

test('a failed retake preserves qualification after any earlier passing attempt', async () => {
  const failedAnswers = correctAnswers().map((answer) => ({ ...answer, a: answer.a === 'A' ? 'B' : 'A' }));
  const result = await submit(failedAnswers, { passedBefore: true });

  assert.equal(result.status, 200);
  assert.equal(result.body.passed, false);
  assert.equal(result.body.qualified, true);
  assert.match(result.body.message, /资格.*保留|保留.*资格/);
});
