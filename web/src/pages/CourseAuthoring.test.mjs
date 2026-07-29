import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopSource = readFileSync(path.join(__dirname, 'CourseAuthoring.jsx'), 'utf8')
const mobileSource = readFileSync(path.join(__dirname, 'mobile', 'CourseAuthoringMobile.jsx'), 'utf8')

test('course material extraction waits for the author to explicitly confirm it', () => {
  assert.match(desktopSource, /const \[pendingMaterial, setPendingMaterial\] = useState\(null\)/)
  assert.match(desktopSource, /setPendingMaterial\(\{ \.\.\.response\.data\.material, preview: response\.data\.preview \}\)/)
  assert.match(desktopSource, /const confirmMaterial = async \(\) => \{[\s\S]*?courseAuthoring\.confirmMaterial\(selectedId, pendingMaterial\.id\)/)
  assert.match(desktopSource, /提取结果预览/)
  assert.match(desktopSource, /确认并纳入课程/)
})

test('mobile course authoring exposes the same pending-material confirmation step', () => {
  assert.match(mobileSource, /待确认教材/)
  assert.match(mobileSource, /确认并纳入课程/)
})
