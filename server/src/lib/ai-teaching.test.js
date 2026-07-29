import test from 'node:test';
import assert from 'node:assert/strict';

import { answerWithTeachingSources, buildDevelopmentTeachingAnswer, teachingSearchTerms } from './ai-teaching.js';

test('derives searchable Chinese keyword fragments without treating the whole question as one phrase', () => {
  const terms = teachingSearchTerms('认识初期怎样设定聊天边界和线下见面节奏？');
  assert.ok(terms.includes('边界'));
  assert.equal(terms.includes('认识初期怎样设定聊天边界和线下见面节奏'), false);
});

test('does not call a model when no published teaching source is available', async () => {
  let calls = 0;
  const result = await answerWithTeachingSources({
    question: '怎样在认识阶段设立边界？',
    sources: [],
    generate: async () => { calls += 1; return '不应被调用'; },
  });

  assert.equal(calls, 0);
  assert.equal(result.outOfScope, true);
  assert.deepEqual(result.citations, []);
});

test('returns server-owned citations instead of model supplied citations', async () => {
  const result = await answerWithTeachingSources({
    question: '怎样在认识阶段设立边界？',
    sources: [{ id: 'unit-1', title: '认识与交往', chapter: '第一课', location: '第 1 节', text: '在公开安全的场合逐步认识。' }],
    generate: async () => '可以逐步认识。\n来源：编造来源',
  });

  assert.equal(result.outOfScope, false);
  assert.equal(result.answer, '可以逐步认识。');
  assert.deepEqual(result.citations, [{ id: 'unit-1', title: '认识与交往', chapter: '第一课', location: '第 1 节' }]);
});

test('development fallback remains grounded in retrieved teaching text', () => {
  assert.match(buildDevelopmentTeachingAnswer([{ text: '在公开安全的场合逐步认识。' }]), /公开安全/);
});
