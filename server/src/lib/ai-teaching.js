const NO_SOURCE_ANSWER = '这个问题暂时没有匹配到已审核发布的课程依据。请带着具体处境联系牧者或成熟引荐人一起分辨。';

export function teachingSearchTerms(question) {
  const compact = String(question || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');
  const terms = new Set();
  for (let index = 0; index < compact.length - 1; index += 1) terms.add(compact.slice(index, index + 2));
  return [...terms].slice(0, 80);
}

export function buildDevelopmentTeachingAnswer(sources) {
  return `根据已审核课程，可以先从这些依据继续分辨：\n${sources.map((source) => `- ${source.text}`).join('\n')}\n\n这不是替你作决定；请在教会群体和牧者的陪伴中继续前行。`;
}

function cleanAnswer(value) {
  return String(value || '')
    .split('\n')
    .filter((line) => !/^\s*(来源|参考|citation)\s*[:：]/i.test(line))
    .join('\n')
    .trim();
}

export async function answerWithTeachingSources({ question, sources, generate }) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return { answer: NO_SOURCE_ANSWER, outOfScope: true, citations: [] };
  }
  const answer = cleanAnswer(await generate({ question, sources }));
  if (!answer) throw new Error('模型没有返回可用答复');
  return {
    answer,
    outOfScope: false,
    citations: sources.map(({ id, title, chapter, location }) => ({ id, title, chapter, location })),
  };
}

export function buildTeachingPrompt({ question, sources }) {
  const context = sources.map((source, index) => `【${index + 1} ${source.title}·${source.chapter}】\n${source.text}`).join('\n\n');
  return [
    '你是遇见路得的改革宗婚恋学习辅助工具。只能依据下列已审核教材回答；不要补充教材之外的教义主张、不要代替牧者作决定、不要给医疗法律或危机建议。不要在回答内伪造来源。',
    `用户问题：${question}`,
    `教材依据：\n${context}`,
  ].join('\n\n');
}
