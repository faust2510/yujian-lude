import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'CourseUnitEditor.jsx'), 'utf8')

test('unit editor uses shared controls and icon-only collection actions', () => {
  assert.match(source, /from ['"]\.\.\/ui\/button['"]/)
  assert.match(source, /from ['"]\.\.\/ui\/input['"]/)
  assert.match(source, /from ['"]lucide-react['"]/)
  assert.match(source, /ChevronUp/)
  assert.match(source, /ChevronDown/)
  assert.match(source, /Trash2/)
  assert.match(source, /aria-label="上移单元"/)
  assert.match(source, /aria-label="下移单元"/)
  assert.match(source, /aria-label="删除单元"/)
})

test('unit editor exposes readonly and field error states', () => {
  assert.match(source, /readonly = false/)
  assert.match(source, /disabled=\{readonly\}/)
  assert.match(source, /aria-invalid=\{Boolean\(errors\./)
  assert.match(source, /role="alert"/)
  assert.match(source, /min-w-0/)
  assert.match(source, /break-words/)
})
