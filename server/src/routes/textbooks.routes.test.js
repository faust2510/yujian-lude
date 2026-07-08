import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createTextbooksRouter } from './textbooks.routes.js';

function makeDb() {
  return {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (/COUNT\(tc\.id\)/.test(sql)) {
        return { rows: [{ slug: 'meaning-of-marriage', title: '婚姻的意义', author: '提摩太·凯勒', chapter_count: 2, completed_count: 1 }] };
      }
      if (/FROM textbooks t\s+JOIN textbook_chapters/.test(sql) && /ORDER BY tc\.chapter_index/.test(sql)) {
        return { rows: [
          { textbook_id: 'book-1', slug: 'meaning-of-marriage', title: '婚姻的意义', author: '提摩太·凯勒', description: null, cover_image: null, chapter_index: 1, chapter_title: '第 1 章', word_count: 100, completed: false },
        ] };
      }
      if (/tc\.body_html/.test(sql)) {
        return { rows: [{ id: 'chapter-1', textbook_id: 'book-1', slug: 'meaning-of-marriage', textbook_title: '婚姻的意义', author: '提摩太·凯勒', chapter_index: 1, title: '第 1 章', body_html: '<p>正文</p>', word_count: 100, completed: false }] };
      }
      if (/ORDER BY chapter_index/.test(sql) && /textbook_id = \$1/.test(sql)) {
        return { rows: [{ chapter_index: 1, title: '第 1 章' }, { chapter_index: 2, title: '第 2 章' }] };
      }
      if (/INSERT INTO textbook_reading_progress/.test(sql)) {
        return { rows: [{ completed: true }] };
      }
      return { rows: [] };
    },
  };
}

async function request(app, method, path) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function makeApp({ user } = {}) {
  const app = express();
  app.use(express.json());
  if (user) app.use((req, _res, next) => { req.user = user; next(); });
  app.use(createTextbooksRouter({ db: makeDb() }));
  return app;
}

test('textbook chapter routes require login', async () => {
  const res = await request(makeApp(), 'GET', '/textbooks/meaning-of-marriage/chapters/1');

  assert.equal(res.status, 401);
  assert.equal(res.body.error, '请先登录');
});

test('textbook detail returns chapter list without body html', async () => {
  const res = await request(makeApp({ user: { id: 'user-1' } }), 'GET', '/textbooks/meaning-of-marriage');

  assert.equal(res.status, 200);
  assert.equal(res.body.textbook.title, '婚姻的意义');
  assert.equal(res.body.chapters[0].chapter_title, '第 1 章');
  assert.equal(res.body.chapters[0].body_html, undefined);
});

test('chapter endpoint returns one chapter body and read action marks complete', async () => {
  const app = makeApp({ user: { id: 'user-1' } });
  const chapter = await request(app, 'GET', '/textbooks/meaning-of-marriage/chapters/1');
  const marked = await request(app, 'POST', '/textbooks/meaning-of-marriage/chapters/1/read');

  assert.equal(chapter.status, 200);
  assert.equal(chapter.body.chapter.body_html, '<p>正文</p>');
  assert.deepEqual(marked.body, { ok: true });
});
