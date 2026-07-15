import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const attributionPath = path.join(root, 'assets/ATTRIBUTION.md');

test('public homepage presents the brand and a real application journey', () => {
  assert.match(html, /<h1[^>]*>\s*遇见路得\s*<\/h1>/);
  assert.match(html, /愿每一次靠近/);
  assert.match(html, />\s*开始遇见\s*</);
  assert.match(html, /href="\/app\/register"/);
  assert.match(html, /id="why"/);
  assert.match(html, /id="journey"/);
  assert.match(html, /id="growth"/);
  assert.match(html, /id="product"/);
  assert.match(html, /不是认识更多人，而是更认真地认识一个人。/);
  assert.match(html, /预备自己/);
  assert.match(html, /真实档案/);
  assert.match(html, /清楚确认/);
  assert.match(html, /路得记 1:16/);
  assert.match(html, /romantic-editorial-couple-v1\.webp/);
  assert.match(html, /public-home-product\.png/);
  assert.doesNotMatch(html, /yujian-lude-login\.png/);
});

test('public homepage opens with the romantic editorial hero', () => {
  assert.match(html, /class="[^"]*hero-love-note[^"]*"/);
  assert.match(html, /认真认识 · 双向选择 · 清楚确认/);
  assert.match(html, /class="hero-petals"[^>]*aria-hidden="true"/);
  assert.match(html, /class="[^"]*hero-trust[^"]*"/);
  assert.match(html, /真实档案/);
  assert.match(html, /共同成长/);
  assert.match(html, /关系有边界/);
});

test('public homepage does not imitate signed-in product features', () => {
  assert.doesNotMatch(html, /id="quickSearch"/);
  assert.doesNotMatch(html, /id="profileForm"/);
  assert.doesNotMatch(html, /id="matchGrid"/);
  assert.doesNotMatch(html, /平台数据|服务套餐|提交顾问审核/);
  assert.doesNotMatch(html, /用户总数|成功配对|成功故事|用户评价/);
});

test('public homepage styles avoid prohibited patterns', () => {
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(css, /--forest|--coral|--sun|--sky/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /--rose:\s*#fff0f4/i);
  assert.match(css, /--cherry:\s*#e84572/i);
  assert.match(css, /--wine:\s*#431326/i);
  assert.match(css, /--mint:\s*#dfeee8/i);
  assert.match(css, /--petal:\s*#f7a9bd/i);
});

test('public homepage keeps mobile navigation usable at edge viewports', () => {
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(js, /matchMedia\(['"]\(min-width:\s*901px\)['"]\)/);
  assert.match(js, /header-actions a/);
  assert.match(js, /event\.key === ['"]Tab['"]/);
  assert.match(js, /setTimeout/);
  assert.match(js, /\.focus\(\)/);
  assert.match(css, /max-height:\s*440px[^}]*orientation:\s*landscape/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.hero\s*\{[^}]*min-height:\s*660px/s);
  assert.match(css, /\.hero\s*\{[^}]*min-height:\s*226px/s);
  assert.match(css, /max-height:\s*440px[^}]*orientation:\s*landscape[\s\S]*?\.relationship-track ol\s*\{[^}]*padding:\s*5px 0 10px/s);
});

test('public homepage progressively enhances motion and meets contrast tokens', () => {
  assert.match(html, /<html[^>]*class="no-js"/);
  assert.match(js, /classList\.replace\(['"]no-js['"], ['"]js['"]\)/);
  assert.match(css, /\.js\s+\.reveal\s*\{/);
  assert.match(css, /--focus:\s*#431326/i);
  assert.match(js, /relationship-line/);
});

test('public homepage uses intentional East Asian media with useful alternatives', () => {
  assert.match(html, /src="\.\/assets\/romantic-editorial-couple-v1\.webp"[^>]+alt="[^"]+"/);
  assert.match(html, /src="\.\/assets\/rose-editorial-growth\.webp"[^>]+alt="[^"]+"/);
  assert.doesNotMatch(html, /class="hero-media"[^>]*aria-hidden="true"/);
  assert.ok(fs.existsSync(attributionPath), 'media attribution file should exist');
  const attribution = fs.readFileSync(attributionPath, 'utf8');
  assert.match(attribution, /Mstyslav Chernov/);
  assert.match(attribution, /CC BY-SA 3\.0/);
  assert.match(attribution, /Wikimedia Commons/);
});

test('public homepage shows the signed-in product and keeps its section pearl white', () => {
  assert.match(html, /public-home-product\.png/);
  assert.match(html, /alt="[^"]*(今日|认识|成长|社区)[^"]*"/);
  assert.doesNotMatch(html, /应用登录页面/);
  assert.match(css, /\.product-section\s*\{[^}]*background:\s*var\(--pearl\)/s);
});

test('public homepage keeps a primary registration action visible on mobile', () => {
  assert.match(html, /class="[^"]*mobile-primary-action[^"]*"[^>]*href="\/app\/register"/);
  assert.match(css, /\.button\.mobile-primary-action\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.button\.mobile-primary-action\s*\{[^}]*display:\s*inline-flex/s);
});

test('public homepage closes the mobile menu after any viewport mode change', () => {
  assert.match(js, /orientation:\s*portrait/);
  assert.match(js, /orientationMedia\.addEventListener\(['"]change['"]/);
  assert.match(js, /orientationMedia[\s\S]*setMenu\(false\)/);
});

test('public homepage relationship paths have normalized lengths and hero motion stays under 700ms', () => {
  const relationshipPaths = [...html.matchAll(/<path\s+([^>]+)>/g)];
  assert.ok(relationshipPaths.length >= 3);
  relationshipPaths.forEach(([, attributes]) => assert.match(attributes, /pathLength="1"/));
  assert.match(css, /\.hero-enter\s*\{[^}]*animation:\s*hero-in\s+380ms/s);
  assert.doesNotMatch(css, /\.hero-enter:nth-child\([^)]*\)\s*\{[^}]*animation-delay:\s*(?:2[5-9]\d|[3-9]\d\d|\d{4,})ms/s);
});
