function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value) {
  return text(value) || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function serializeCourseMaterial(material) {
  if (material == null) return '';
  if (typeof material === 'string') return material;
  return JSON.stringify(material);
}

export function parseCourseMaterial(material) {
  if (material == null || material === '') return '';
  if (typeof material !== 'string') return material;
  const value = material.trim();
  if (!value || !['{', '[', '"'].includes(value[0])) return material;
  try {
    return JSON.parse(value);
  } catch {
    return material;
  }
}

function normalizeMaterial(material) {
  return typeof material === 'string' ? material.trim() : (material ?? '');
}

const TEACHING_TEMPLATES = new Set(['system_course', 'reading_guide', 'short_lesson']);

export function normalizeCourseDraft(draft = {}) {
  const units = list(draft.units).map((unit = {}, index) => ({
    ...unit,
    unit_index: index + 1,
    title: text(unit.title),
    material: normalizeMaterial(unit.material),
    is_pastor_node: Boolean(unit.is_pastor_node),
  }));
  const sourceExam = draft.exam ?? {};
  const questions = list(sourceExam.questions).map((question = {}, index) => ({
    ...question,
    question_index: index + 1,
    prompt: text(question.prompt),
    options: list(question.options).map(text),
    correct_option: integerOrNull(question.correct_option),
    explanation: optionalText(question.explanation),
  }));

  return {
    ...draft,
    title: text(draft.title),
    subtitle: optionalText(draft.subtitle),
    description: text(draft.description),
    cover_image: optionalText(draft.cover_image),
    template_type: TEACHING_TEMPLATES.has(draft.template_type) ? draft.template_type : 'system_course',
    scripture_references: optionalText(draft.scripture_references),
    ai_eligible: draft.ai_eligible !== false,
    units,
    exam: {
      ...sourceExam,
      pass_threshold: integerOrNull(sourceExam.pass_threshold),
      questions,
    },
  };
}

function hasMaterialBody(material) {
  const parsed = parseCourseMaterial(material);
  if (typeof parsed === 'string') return parsed.trim().length > 0;
  if (!parsed || typeof parsed !== 'object') return false;
  const body = parsed.body ?? parsed.content ?? parsed.text;
  return typeof body === 'string' ? body.trim().length > 0 : Object.keys(parsed).length > 0;
}

function consecutive(items, key) {
  return items.every((item, index) => Number(item?.[key]) === index + 1);
}

function appendMessage(messages, message) {
  if (message) messages.push(message);
}

export function validateCourseSubmission(draft = {}) {
  const errors = {};
  const units = list(draft.units);
  const exam = draft.exam ?? {};
  const questions = list(exam.questions);

  if (!text(draft.title)) errors.title = '课程标题不能为空';
  if (!text(draft.description)) errors.description = '课程简介不能为空';

  const unitMessages = [];
  appendMessage(unitMessages, units.length < 1 || units.length > 30 ? '课程单元数量须为 1 到 30 个' : '');
  appendMessage(unitMessages, units.length > 0 && !consecutive(units, 'unit_index') ? '课程单元序号必须从 1 开始连续排列' : '');
  if (unitMessages.length) errors.units_message = unitMessages.join('；');

  const unitErrors = [];
  units.forEach((unit, index) => {
    const current = {};
    if (!text(unit?.title)) current.title = '单元标题不能为空';
    if (!hasMaterialBody(unit?.material)) current.material = '单元正文不能为空';
    if (Object.keys(current).length) unitErrors[index] = current;
  });
  if (unitErrors.length) errors.units = unitErrors;

  const examErrors = {};
  const threshold = exam.pass_threshold;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
    examErrors.pass_threshold = '通过分数须为 1 到 100 的整数';
  }

  const questionMessages = [];
  appendMessage(questionMessages, questions.length < 3 || questions.length > 50 ? '考试题目数量须为 3 到 50 道' : '');
  appendMessage(questionMessages, questions.length > 0 && !consecutive(questions, 'question_index') ? '考试题目序号必须从 1 开始连续排列' : '');
  if (questionMessages.length) examErrors.questions_message = questionMessages.join('；');

  const questionErrors = [];
  questions.forEach((question, questionIndex) => {
    const current = {};
    const options = list(question?.options);
    if (!text(question?.prompt)) current.prompt = '题目内容不能为空';
    if (options.length < 2 || options.length > 6) current.options_message = '每题须有 2 到 6 个选项';

    const optionErrors = [];
    options.forEach((option, optionIndex) => {
      if (!text(option)) optionErrors[optionIndex] = '选项内容不能为空';
    });
    if (optionErrors.length) current.options = optionErrors;

    const correctOption = question?.correct_option;
    if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length) {
      current.correct_option = '请选择有效的正确答案';
    }
    if (Object.keys(current).length) questionErrors[questionIndex] = current;
  });
  if (questionErrors.length) examErrors.questions = questionErrors;
  if (Object.keys(examErrors).length) errors.exam = examErrors;

  return errors;
}

export function canEditCourse(user, course) {
  if (!user || !course) return false;
  if (user.role === 'admin') return true;
  return user.role === 'pastor'
    && String(course.author_id) === String(user.id)
    && ['draft', 'changes_requested'].includes(course.publication_state);
}

export function canReviewCourse(user, course) {
  if (!user || !course || course.publication_state !== 'pending_review') return false;
  if (user.role === 'admin') return true;
  return user.role === 'pastor' && String(user.id) !== String(course.author_id);
}

export function nextPublicationState(currentState, action) {
  const transitions = {
    draft: { submit: 'pending_review', save: 'draft' },
    changes_requested: { submit: 'pending_review', save: 'changes_requested' },
    pending_review: {
      approve: 'published',
      request_changes: 'changes_requested',
      archive: 'archived',
    },
    published: { archive: 'archived' },
    archived: {},
  };
  const next = transitions[currentState]?.[action];
  if (!next) throw new Error('课程状态不允许此操作');
  return next;
}

export const normalizeDraft = normalizeCourseDraft;
export const serializeMaterial = serializeCourseMaterial;
export const parseMaterial = parseCourseMaterial;
