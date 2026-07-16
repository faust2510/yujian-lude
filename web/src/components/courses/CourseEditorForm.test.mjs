import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'CourseEditorForm.jsx'), 'utf8')

test('course editor form composes units and exam without nested cards', () => {
  assert.match(source, /<CourseUnitEditor/)
  assert.match(source, /<CourseExamEditor/)
  assert.doesNotMatch(source, /<Card/)
  assert.match(source, /<Separator/)
  assert.match(source, /min-w-0/)
  assert.match(source, /break-words/)
})

test('course editor form supports readonly fields and server field errors', () => {
  assert.match(source, /readonly = false/)
  assert.match(source, /disabled=\{readonly/)
  assert.match(source, /fieldErrors = \{\}/)
  assert.match(source, /aria-invalid=\{Boolean\(fieldErrors\./)
  assert.match(source, /role="alert"/)
})

test('changes requested review note stays visible', () => {
  assert.match(source, /reviewNote/)
  assert.match(source, /审核意见/)
  assert.match(source, /<Alert/)
  assert.match(source, /<AlertDescription/)
})
