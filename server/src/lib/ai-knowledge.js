const OUT_OF_SCOPE_PATTERNS = [
  /法律|诉讼|律师|起诉|离婚协议|财产分割/,
  /医疗|诊断|药物|用药|抑郁症|焦虑症/,
  /自杀|轻生|伤害自己|伤害他人|家暴|暴力/,
  /打(?:了|过)?我|殴打我|揍我|扇(?:我)?(?:耳光|巴掌)|踢我|踹我|掐(?:我|住我的?脖子)|勒(?:我|住我的?脖子)|推倒我/,
  /(?:对我动手|动手打我|扇了我(?:一)?(?:耳光|巴掌)|控制我的?(?:手机|社交|联系|出行)|不让我联系(?:家人|朋友))/,
  /威胁.*(?:杀|弄死|伤害|殴打|报复)|(?:敢|如果|要是).*(?:分手|离开|报警).*(?:杀|弄死|伤害|殴打|报复)/,
  /(?:不许|不准|不让我)(?:出门|工作|上学|见朋友|见家人)|(?:没收|拿走|扣押)(?:了)?我的?(?:身份证|手机|银行卡|工资)/,
  /(?:私密|裸照|不雅)(?:照片|视频|照)?.*(?:逼|威胁|要挟|勒索)|(?:逼|威胁|要挟|勒索).*(?:私密|裸照|不雅)/,
  /(?:强迫|逼迫|胁迫|威逼).*(?:发生性关系|性行为|做爱|性交)|(?:拒绝|不同意|不愿意).*(?:还是|仍然|强行).*(?:发生性关系|性行为|做爱|性交|碰我)/,
  /(?:我说不要|我不同意|我拒绝|我不愿意).*(?:还是|仍然|强行)?.*(?:和我发生了关系|发生性关系|性行为|做爱|性交|碰我)/,
  /强奸|性侵|逼(?:着)?我.*(?:发生性关系|性行为|做爱|性交)|(?:说|扬言).*(?:会|要)?杀我|要杀我|杀死我|弄死我|死亡威胁/,
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
    id: 'faith-test-boundary',
    source: '平台信仰测试：内容、通过资格与边界',
    keywords: ['信仰测试', '测试', '考什么', '题目', '测试资格', '通过标准', '通过线'],
    text:
      '平台信仰测试共 20 题，内容限于平台设置的基要信仰知识；答对 15 题即通过，并满足匹配池中的信仰测试资格。这个结果只是平台资格记录，不是对个人信仰真伪、教义立场或属灵成熟度的裁判，也不替代牧者的陪伴。',
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
  {
    id: 'relationship-confirmation-process',
    source: '关系守则：关系确认流程与双方见证',
    keywords: ['关系确认', '确认流程', '开启关系', '双方确认', '牧者审核', '确认关系'],
    text:
      '关系确认只能从已互相匹配且仍有未关闭聊天通道的对象中开启。双方各自通过恋爱必修课并确认推进意愿后，再由双方牧者或引荐人分别审核；双方确认与两侧审核都完成，关系才进入已确认状态。任何一方都可以在确认前暂停或结束流程。',
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
        '我现在只能回答婚恋预备、边界沟通、信仰档案、课程学习和关系确认相关问题。这个问题暂时没有匹配到平台知识库，建议你带着具体处境去找牧者或引荐人面谈。',
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
