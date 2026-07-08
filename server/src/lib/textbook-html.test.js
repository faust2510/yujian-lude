import assert from 'node:assert/strict';
import test from 'node:test';
import { countWords, htmlToText, sanitizeChapterHtml } from './textbook-html.js';

test('sanitizeChapterHtml strips scripts and unsafe attributes while keeping reading tags', () => {
  const html = '<h1 onclick="x()">Hi</h1><script>x()</script><p>A <em>B</em> <a href="javascript:bad()">bad</a></p>';

  const clean = sanitizeChapterHtml(html);

  assert.match(clean, /<h1>Hi<\/h1>/);
  assert.match(clean, /<p>A <em>B<\/em> <a>bad<\/a><\/p>/);
  assert.doesNotMatch(clean, /script|onclick|javascript:/i);
});

test('htmlToText and countWords derive searchable text without markup', () => {
  const text = htmlToText('<h2>标题</h2><p>Grace and covenant</p>');

  assert.equal(text, '标题 Grace and covenant');
  assert.equal(countWords(text), 5);
});
