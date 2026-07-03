const OUT_OF_SCOPE_PATTERNS = [
  /法律|诉讼|律师|起诉|离婚协议|财产分割/,
  /医疗|诊断|药物|用药|抑郁症|焦虑症/,
  /自杀|轻生|伤害自己|伤害他人|家暴|暴力/,
  /预言|算命|异梦|神给我的配偶|一定是神的旨意/,
];

const ESCALATION_ANSWER =
  '这个问题超出了平台 AI 咨询的安全范围。请尽快联系你的牧者、属灵长辈，必要时联系当地专业机构或紧急服务；这类问题需要认识你的人和专业人员一起陪你面对。';

export const AI_KNOWLEDGE_CHUNKS = [
  {
    id: 'dating-boundaries',
    source: '恋爱必修课：边界、节奏与安全感',
    keywords: ['边界', '节奏', '聊天', '线下', '见面', '隐私', '安全感', '亲密'],
    text:
      '认识初期要逐步了解、保留必要隐私、选择公开安全的线下见面场景，避免过快绑定情绪。边界不是不信任，而是保护双方在真实和清楚中成长。',
  },
  {
    id: 'dating-faith',
    source: '恋爱必修课：如何谈信仰、呼召与教会生活',
    keywords: ['信仰', '教会', '呼召', '读经', '祷告', '聚会', '属灵'],
    text:
      '信仰会影响婚姻中的敬拜、教养、服事、金钱、时间和冲突处理。关系推进时应逐步谈清楚教会生活、读经祷告、家庭属灵生活期待和愿意成长的态度。',
  },
  {
    id: 'dating-family-money',
    source: '恋爱必修课：家庭、财务、城市与未来责任',
    keywords: ['家庭', '父母', '财务', '金钱', '城市', '职业', '未来', '责任'],
    text:
      '家庭责任、财务观、职业方向、未来城市和父母期待都会影响婚姻。成熟沟通是在适当阶段诚实说明自己的责任和限制，也认真听对方的处境。',
  },
  {
    id: 'dating-conflict',
    source: '恋爱必修课：冲突、道歉与停止升级',
    keywords: ['冲突', '道歉', '冷暴力', '撒谎', '越界', '施压', '红灯', '停止'],
    text:
      '认识阶段的小冲突能显出一个人如何处理失望、边界和被拒绝。若出现羞辱、控制、撒谎、越界或持续施压，应暂停推进并寻求成熟帮助。',
  },
  {
    id: 'marriage-covenant',
    source: '婚姻的意义：婚姻的本质与终生盟约',
    keywords: ['盟约', '承诺', '婚姻', '委身', '浪漫', '感觉', '终生'],
    text:
      '婚姻不是满足自我的合同，而是在真实认识后进入信实委身。浪漫感觉是礼物，但不能取代在真理、群体见证和持续悔改中的盟约承诺。',
  },
  {
    id: 'community-covering',
    source: '恋爱必修课：属灵遮盖、引荐人与群体见证',
    keywords: ['牧者', '引荐人', '遮盖', '背书', '群体', '确认', '审核'],
    text:
      '牧者、引荐人或成熟肢体不能替你决定婚姻，但可以帮助核实基本处境、辨认危险信号、看见盲点，并在关系推进时提供保护与见证。',
  },
];

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

export function isAiQuestionOutOfScope(question) {
  const text = normalize(question);
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
}

export function retrieveAiKnowledge(question) {
  const text = normalize(question);
  if (!text || isAiQuestionOutOfScope(text)) return { hit: false, chunks: [] };

  const scored = AI_KNOWLEDGE_CHUNKS.map((chunk) => {
    const score = chunk.keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
    return { chunk, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.chunk);

  return { hit: scored.length > 0, chunks: scored };
}

export function buildAiAnswer(question) {
  if (isAiQuestionOutOfScope(question)) {
    return { answer: ESCALATION_ANSWER, outOfScope: true, sources: [] };
  }

  const retrieved = retrieveAiKnowledge(question);
  if (!retrieved.hit) {
    return {
      answer:
        '我现在只能回答婚恋预备、边界沟通、信仰档案、课程学习和关系确认相关问题。这个问题暂时没有匹配到平台知识库，建议你带着具体处境去找牧者或成熟引荐人面谈。',
      outOfScope: true,
      sources: [],
    };
  }

  const body = retrieved.chunks.map((chunk) => `- ${chunk.text}`).join('\n');
  return {
    answer: `根据平台课程和关系守则，可以先这样分辨：\n${body}\n\n这不是替你作决定，而是帮助你把问题带回真理、边界和教会群体的见证中。`,
    outOfScope: false,
    sources: retrieved.chunks.map((chunk) => ({ id: chunk.id, source: chunk.source })),
  };
}
