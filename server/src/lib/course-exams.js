export const COURSE_EXAMS = {
  'keller-meaning-of-marriage': {
    passThreshold: 8,
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
      {
        id: 'keller-6',
        q: '当婚姻中的冲突显出自己的骄傲和恐惧时，福音导向的回应是：',
        options: {
          A: '只证明对方的问题更严重',
          B: '承认自己的罪和防卫模式，在恩典中学习悔改',
          C: '用沉默惩罚对方',
          D: '把所有冲突解释为性格不合',
        },
        answer: 'B',
      },
      {
        id: 'keller-7',
        q: '关于婚姻中的身体与亲密，课程强调：',
        options: {
          A: '身体与信仰无关，只是私人选择',
          B: '亲密只要双方愿意就没有属灵意义',
          C: '身体属于主，亲密需要在盟约、尊严和圣洁中理解',
          D: '谈论身体一定是不属灵的',
        },
        answer: 'C',
      },
      {
        id: 'keller-8',
        q: '为什么婚姻需要教会群体和牧者节点的提醒？',
        options: {
          A: '因为两个人完全没有判断力',
          B: '因为群体能提供见证、保护和盲点提醒',
          C: '因为婚姻只是教会管理事务',
          D: '因为第三方应当控制每个决定',
        },
        answer: 'B',
      },
      {
        id: 'keller-9',
        q: '课程如何看待浪漫感觉和盟约承诺的关系？',
        options: {
          A: '浪漫感觉应当完全被否定',
          B: '只有感觉强烈时才需要承诺',
          C: '感觉是礼物，但不能取代信实委身',
          D: '承诺只是没有感觉时的妥协',
        },
        answer: 'C',
      },
      {
        id: 'keller-10',
        q: '完成婚姻装备课程后，进入关系更成熟的标志是：',
        options: {
          A: '更会包装自己以获得匹配',
          B: '能更真实地认识自己、尊重对方，并在真理和群体中前行',
          C: '认为自己已经不需要任何提醒',
          D: '把课程当作获得权益的形式流程',
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

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function publicPersistedCourseExam(exam, questions) {
  return {
    passThreshold: Math.ceil((questions.length * Number(exam.pass_threshold)) / 100),
    total: questions.length,
    questions: questions.map((question) => ({
      id: question.id,
      q: question.prompt,
      options: Object.fromEntries(question.options.map((option, index) => [LETTERS[index], option])),
    })),
  };
}

export function gradePersistedCourseExam(exam, questions, answers = []) {
  const byId = new Map(Array.isArray(answers) ? answers.map((item) => [item.id, item.a]) : []);
  const score = questions.reduce((sum, question) => {
    const correct = LETTERS[Number(question.correct_option)];
    return sum + (byId.get(question.id) === correct ? 1 : 0);
  }, 0);
  const passThreshold = Math.ceil((questions.length * Number(exam.pass_threshold)) / 100);
  return {
    score,
    total: questions.length,
    passThreshold,
    passed: score >= passThreshold,
  };
}
