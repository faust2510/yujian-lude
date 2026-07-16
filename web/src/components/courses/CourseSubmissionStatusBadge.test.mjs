import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'CourseSubmissionStatusBadge.jsx'), 'utf8')

test('submission status labels cover all five publication states', () => {
  const expectedLabels = {
    draft: '草稿',
    pending_review: '待审核',
    changes_requested: '需修改',
    published: '已发布',
    archived: '已归档',
  }

  for (const [state, label] of Object.entries(expectedLabels)) {
    assert.match(source, new RegExp(`${state}:[\\s\\S]*?${label}`))
  }
})

test('status badge uses the shared shadcn badge and exposes its state', () => {
  assert.match(source, /from ['"]\.\.\/ui\/badge['"]/)
  assert.match(source, /<Badge/)
  assert.match(source, /data-status=\{status\}/)
})
