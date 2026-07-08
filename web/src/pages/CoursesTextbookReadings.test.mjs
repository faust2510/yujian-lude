import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'Courses.jsx'), 'utf8')
const cssSource = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8')

test('course units render required textbook readings before allowing read confirmation', () => {
  assert.match(source, /CourseUnitReadings/)
  assert.match(source, /教材阅读/)
  assert.match(source, /missingRequiredReadings/)
  assert.match(source, /请先读完本单元绑定教材章节/)
  assert.match(source, /\/textbooks\/\$\{reading\.textbook_slug\}\/chapters\/\$\{reading\.chapter_index\}/)
  assert.match(cssSource, /\.course-unit-readings/)
  assert.match(cssSource, /\.course-reading-link/)
})
