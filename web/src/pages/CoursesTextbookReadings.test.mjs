import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'Courses.jsx'), 'utf8')
const pastorSource = readFileSync(path.join(__dirname, 'Pastor.jsx'), 'utf8')
const clientSource = readFileSync(path.join(__dirname, '..', 'api', 'client.js'), 'utf8')
const userMenuSource = readFileSync(path.join(__dirname, '..', 'components', 'app', 'UserMenu.jsx'), 'utf8')
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

test('deep courses expose an endorsement-scoped review workflow', () => {
  assert.match(clientSource, /requestPastorReview/)
  assert.match(clientSource, /coursePastorReviews/)
  assert.match(clientSource, /endorsement_id/)
  assert.match(source, /选择牧者或引荐人/)
  assert.match(source, /申请说明/)
  assert.match(source, /申请引荐确认/)
  assert.match(source, /pastor_review/)
  assert.match(pastorSource, /课程引荐确认待办/)
  assert.match(pastorSource, /退回原因/)
  assert.match(pastorSource, /exam_score/)
  assert.match(pastorSource, /确认通过/)
  assert.match(userMenuSource, /to="\/pastor"/)
  assert.match(userMenuSource, /引荐工作台/)
})

test('deep course pastor nodes are requested and displayed independently', () => {
  assert.match(clientSource, /requestPastorReview:\s*\(slug, unitId, endorsementId/)
  assert.match(clientSource, /unit_id:\s*unitId/)
  assert.match(source, /pastor_reviews/)
  assert.match(source, /unit\.unit_index/)
  assert.match(source, /申请该节点确认/)
  assert.match(pastorSource, /item\.unit_index/)
  assert.match(pastorSource, /item\.unit_title/)
})

test('course UI explains the midterm gate and only exposes each pastor request when the server state permits it', () => {
  assert.match(source, /第 5 单元完成后可申请期中牧者确认/)
  assert.match(source, /期中牧者确认通过后才能继续第 6 至 10 单元/)
  assert.match(source, /第 10 单元完成并通过结课考试后才能申请结业牧者确认/)
  assert.match(source, /reviewEligibility/)
})

test('legacy in-progress learners at unit five can see the midterm review application area', () => {
  assert.match(source, /const showPastorReview = progress\?\.state === 'pastor_review' \|\| reviewEligibility\.get\(midtermUnit\?\.id\) === true/)
  assert.match(source, /\{showPastorReview && \(/)
})

test('course summary ignores superseded rejected pastor reviews', () => {
  const statusFunction = source.match(/function statusText\(progress, latestExam\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(statusFunction, 'statusText should remain directly testable')
  const statusText = Function(`${statusFunction}; return statusText`)()
  const status = statusText({
    state: 'pastor_review',
    pastor_reviews: [
      { id: 'new-approved', unit_id: 'unit-1', state: 'approved' },
      { id: 'old-rejected', unit_id: 'unit-1', state: 'rejected' },
    ],
  })
  assert.equal(status, '待申请引荐确认')
})
