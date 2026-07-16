import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addCollectionItem,
  addQuestionOption,
  moveCollectionItem,
  removeCollectionItem,
  removeQuestionOption,
  setCorrectOption,
} from './CourseEditorCollections.js'

test('unit add and remove controls preserve continuous order', () => {
  const initial = [
    { unit_index: 4, title: '第一单元' },
    { unit_index: 9, title: '第二单元' },
  ]

  const added = addCollectionItem(initial, { title: '第三单元' }, 'unit_index')
  assert.deepEqual(added.map((unit) => unit.unit_index), [1, 2, 3])
  assert.deepEqual(initial.map((unit) => unit.unit_index), [4, 9])

  const removed = removeCollectionItem(added, 1, 'unit_index')
  assert.deepEqual(removed.map((unit) => [unit.unit_index, unit.title]), [
    [1, '第一单元'],
    [2, '第三单元'],
  ])
})

test('unit move controls preserve continuous order and do not mutate input', () => {
  const units = [
    { unit_index: 1, title: '一' },
    { unit_index: 2, title: '二' },
    { unit_index: 3, title: '三' },
  ]

  const moved = moveCollectionItem(units, 2, -1, 'unit_index')
  assert.deepEqual(moved.map((unit) => unit.title), ['一', '三', '二'])
  assert.deepEqual(moved.map((unit) => unit.unit_index), [1, 2, 3])
  assert.deepEqual(units.map((unit) => unit.title), ['一', '二', '三'])
  assert.strictEqual(moveCollectionItem(units, 0, -1, 'unit_index'), units)
  assert.strictEqual(moveCollectionItem(units, 2, 1, 'unit_index'), units)
})

test('question editor keeps exactly one valid correct option', () => {
  const question = {
    options: ['恩典', '律法', '盟约'],
    correct_option: 1,
  }

  const selected = setCorrectOption(question, 2)
  assert.equal(selected.correct_option, 2)
  assert.equal(question.correct_option, 1)

  const removedBeforeAnswer = removeQuestionOption(selected, 0)
  assert.deepEqual(removedBeforeAnswer.options, ['律法', '盟约'])
  assert.equal(removedBeforeAnswer.correct_option, 1)

  const removedAnswer = removeQuestionOption(question, 1)
  assert.deepEqual(removedAnswer.options, ['恩典', '盟约'])
  assert.equal(removedAnswer.correct_option, 0)

  const added = addQuestionOption(removedAnswer)
  assert.equal(added.options.length, 3)
  assert.equal(added.correct_option, 0)
})

test('question options remain within the two to six option boundary', () => {
  const minimum = { options: ['A', 'B'], correct_option: 0 }
  assert.strictEqual(removeQuestionOption(minimum, 0), minimum)

  const maximum = { options: ['A', 'B', 'C', 'D', 'E', 'F'], correct_option: 0 }
  assert.strictEqual(addQuestionOption(maximum), maximum)
  assert.strictEqual(setCorrectOption(minimum, 9), minimum)
})
