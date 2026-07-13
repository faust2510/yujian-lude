import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('public homepage presents the brand and a real application journey', () => {
  assert.match(html, /<h1[^>]*>\s*遇见路得\s*<\/h1>/);
  assert.match(html, /href="\/app\/register"/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="journey"/);
  assert.match(html, /id="growth"/);
  assert.match(html, /public-home-product\.png/);
  assert.doesNotMatch(html, /yujian-lude-login\.png/);
});

test('public homepage does not imitate signed-in product features', () => {
  assert.doesNotMatch(html, /id="quickSearch"/);
  assert.doesNotMatch(html, /id="profileForm"/);
  assert.doesNotMatch(html, /id="matchGrid"/);
  assert.doesNotMatch(html, /平台数据|服务套餐|提交顾问审核/);
});

test('public homepage styles avoid prohibited patterns', () => {
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});
