import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { QUESTIONS } from '../lib/faith-questions.js';
import * as faithTestRoutes from './faith-test.routes.js';

function correctAnswers() {
  return QUESTIONS.map(({ id, answer }) => ({ id, a: answer }));
}

function makeDb() {
  const inserts = [];
  return {
    inserts,
    async one(sql) {
      if (/COUNT\(\*\)/.test(sql)) return { n: 0 };
      return null;
    },
    async tx(callback) {
      return callback({
        async query(sql, params) {
          inserts.push({ sql, params });
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

async function submit(answers) {
  const db = makeDb();
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
  assert.equal(result.db.inserts.length, 1);
});
