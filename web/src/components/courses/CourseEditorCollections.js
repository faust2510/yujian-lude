export function reindexCollection(items, indexKey) {
  return items.map((item, index) => ({
    ...item,
    [indexKey]: index + 1,
  }))
}

export function addCollectionItem(items, item, indexKey) {
  return reindexCollection([...items, item], indexKey)
}

export function removeCollectionItem(items, index, indexKey) {
  if (index < 0 || index >= items.length) return items
  return reindexCollection(items.filter((_, itemIndex) => itemIndex !== index), indexKey)
}

export function moveCollectionItem(items, index, direction, indexKey) {
  const targetIndex = index + direction
  if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
    return items
  }

  const nextItems = [...items]
  ;[nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]]
  return reindexCollection(nextItems, indexKey)
}

export function createCourseUnit() {
  return {
    unit_index: 0,
    title: '',
    material: '',
    is_pastor_node: false,
  }
}

export function createExamQuestion() {
  return {
    question_index: 0,
    prompt: '',
    options: ['', ''],
    correct_option: 0,
    explanation: '',
  }
}

export function setCorrectOption(question, optionIndex) {
  if (optionIndex < 0 || optionIndex >= question.options.length) return question
  return { ...question, correct_option: optionIndex }
}

export function addQuestionOption(question) {
  if (question.options.length >= 6) return question
  return { ...question, options: [...question.options, ''] }
}

export function removeQuestionOption(question, optionIndex) {
  if (question.options.length <= 2 || optionIndex < 0 || optionIndex >= question.options.length) {
    return question
  }

  const options = question.options.filter((_, index) => index !== optionIndex)
  let correctOption = question.correct_option
  if (correctOption === optionIndex) correctOption = Math.max(0, optionIndex - 1)
  else if (correctOption > optionIndex) correctOption -= 1

  return {
    ...question,
    options,
    correct_option: Math.min(correctOption, options.length - 1),
  }
}
