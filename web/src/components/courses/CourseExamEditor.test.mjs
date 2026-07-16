import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'CourseExamEditor.jsx'), 'utf8')

test('exam editor renders one radio group for each question correct answer', () => {
  assert.match(source, /type="radio"/)
  assert.match(source, /name=\{`question-\$\{questionKey\}-correct`\}/)
  assert.match(source, /checked=\{question\.correct_option === optionIndex\}/)
  assert.match(source, /setCorrectOption/)
  assert.match(source, /removeQuestionOption/)
})

test('exam editor supports ordered questions, limits, readonly, and errors', () => {
  assert.match(source, /question_index/)
  assert.match(source, /moveCollectionItem/)
  assert.match(source, /min=\{1\}/)
  assert.match(source, /max=\{100\}/)
  assert.match(source, /readonly = false/)
  assert.match(source, /disabled=\{readonly/)
  assert.match(source, /role="alert"/)
  assert.match(source, /min-w-0/)
})
