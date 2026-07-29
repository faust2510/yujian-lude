import test from 'node:test';
import assert from 'node:assert/strict';

import { requireSearchablePdfText } from './textbook-pdf.js';

test('rejects a scanned PDF without extractable text', () => {
  assert.throws(() => requireSearchablePdfText('  '), /可搜索文字/);
});

test('accepts searchable PDF text and normalizes whitespace', () => {
  assert.equal(requireSearchablePdfText('第一章\n\n婚姻是盟约，需要在教会群体的见证中学习信实与彼此服事。').text, '第一章\n婚姻是盟约，需要在教会群体的见证中学习信实与彼此服事。');
});
