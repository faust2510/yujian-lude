export const COURSE_EXAMS = {
  'christian-dating-basics': {
    passThreshold: 3,
    questions: [
      {
        id: 'basics-1',
        q: '进入认识关系前，最重要的预备是什么？',
        options: {
          A: '尽快交换全部私人信息',
          B: '先确认边界、节奏与属灵目标',
          C: '只看第一印象和心动感觉',
          D: '避开教会和成熟肢体的意见',
        },
        answer: 'B',
      },
      {
        id: 'basics-2',
        q: '平台鼓励的沟通方式是：',
        options: {
          A: '真诚、清楚、循序渐进',
          B: '暧昧试探，不表达真实期待',
          C: '用压力逼对方快速承诺',
          D: '只谈感觉，不谈信仰和责任',
        },
        answer: 'A',
      },
      {
        id: 'basics-3',
        q: '谈到家庭、信仰与未来期待时，合宜的态度是：',
        options: {
          A: '越晚谈越好，避免尴尬',
          B: '只要喜欢就不需要讨论',
          C: '在合适节奏中诚实沟通',
          D: '让对方完全迁就自己',
        },
        answer: 'C',
      },
      {
        id: 'basics-4',
        q: '从心动走向负责任下一步，意味着：',
        options: {
          A: '把关系交给冲动决定',
          B: '在祷告、沟通和群体见证中前行',
          C: '隐藏重要事实以免失去机会',
          D: '只要双方喜欢就不需要边界',
        },
        answer: 'B',
      },
    ],
  },
  'keller-meaning-of-marriage': {
    passThreshold: 4,
    questions: [
      {
        id: 'keller-1',
        q: '课程强调婚姻首先应被理解为：',
        options: {
          A: '满足个人浪漫想象的安排',
          B: '双方利益交换的合同',
          C: '在基督里彼此委身的盟约',
          D: '解决孤独的唯一方式',
        },
        answer: 'C',
      },
      {
        id: 'keller-2',
        q: '面对配偶或未来配偶的软弱，课程鼓励的方向是：',
        options: {
          A: '用恩典和真理帮助彼此成长',
          B: '立刻寻找更完美的人',
          C: '用羞辱推动对方改变',
          D: '忽略所有问题',
        },
        answer: 'A',
      },
      {
        id: 'keller-3',
        q: '单身和婚姻在基督徒生命中应如何理解？',
        options: {
          A: '单身必然低于婚姻',
          B: '婚姻才证明生命完整',
          C: '二者都应在永恒国度中被重新定位',
          D: '单身者不需要预备关系',
        },
        answer: 'C',
      },
      {
        id: 'keller-4',
        q: '婚姻中的友谊与扶持，核心不是：',
        options: {
          A: '彼此认识',
          B: '彼此代祷',
          C: '彼此成全',
          D: '彼此控制',
        },
        answer: 'D',
      },
      {
        id: 'keller-5',
        q: '课程中的“终生盟约”意味着：',
        options: {
          A: '完全不会经历冲突',
          B: '以信实委身承载真实生活',
          C: '只在感觉强烈时维持关系',
          D: '把婚姻当作个人成就奖章',
        },
        answer: 'B',
      },
    ],
  },
};

function examFor(slug) {
  const exam = COURSE_EXAMS[slug];
  if (!exam) throw new Error('课程考试不存在');
  return exam;
}

export function publicCourseExam(slug) {
  const exam = examFor(slug);
  return {
    passThreshold: exam.passThreshold,
    total: exam.questions.length,
    questions: exam.questions.map(({ answer, ...question }) => question),
  };
}

export function courseExamAnswers(slug) {
  return examFor(slug).questions.map((question) => ({ id: question.id, a: question.answer }));
}

export function gradeCourseExam(slug, answers = []) {
  const exam = examFor(slug);
  const byId = new Map(Array.isArray(answers) ? answers.map((item) => [item.id, item.a]) : []);
  const score = exam.questions.reduce((sum, question) => {
    return sum + (byId.get(question.id) === question.answer ? 1 : 0);
  }, 0);
  return {
    score,
    total: exam.questions.length,
    passThreshold: exam.passThreshold,
    passed: score >= exam.passThreshold,
  };
}
