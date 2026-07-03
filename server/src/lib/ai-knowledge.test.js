import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAiAnswer, retrieveAiKnowledge } from './ai-knowledge.js';

test('retrieves marriage-boundary guidance with sources', () => {
  const result = retrieveAiKnowledge('认识初期应该怎样设定边界和聊天节奏？');

  assert.equal(result.hit, true);
  assert.ok(result.chunks.length >= 1);
  assert.ok(result.chunks.some((chunk) => chunk.source.includes('恋爱必修课')));
});

test('builds an in-scope answer from bounded sources', () => {
  const answer = buildAiAnswer('我们刚认识，应该多久线下见面？');

  assert.equal(answer.outOfScope, false);
  assert.ok(answer.answer.includes('边界') || answer.answer.includes('公开安全'));
  assert.ok(answer.sources.length >= 1);
});

test('refuses medical legal emergency and prophecy-like questions', () => {
  for (const question of [
    '我需要离婚诉讼法律建议怎么办？',
    '我有自杀冲动，你直接告诉我怎么处理',
    '你能预言这个人是不是神给我的配偶吗？',
  ]) {
    const answer = buildAiAnswer(question);
    assert.equal(answer.outOfScope, true, question);
    assert.deepEqual(answer.sources, []);
    assert.match(answer.answer, /牧者|专业|紧急/);
  }
});
