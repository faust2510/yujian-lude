import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dashboardSource = readFileSync(path.join(__dirname, 'Dashboard.jsx'), 'utf8')
const dashboardCssPath = path.join(__dirname, 'Dashboard.css')
const dashboardCss = existsSync(dashboardCssPath) ? readFileSync(dashboardCssPath, 'utf8') : ''

test('dashboard exposes exactly one authoritative next-step region', () => {
  assert.equal((dashboardSource.match(/data-dashboard-next-step/g) || []).length, 1)
  assert.doesNotMatch(dashboardSource, /下一步做什么/)
  assert.doesNotMatch(dashboardSource, /GATE_STEPS\.map/)
})

test('matching eligibility blockers render before secondary points and course information', () => {
  const nextStepIndex = dashboardSource.indexOf('data-dashboard-next-step')
  const secondaryIndex = dashboardSource.indexOf('data-dashboard-secondary')

  assert.ok(nextStepIndex >= 0, '缺少权威的下一步区域')
  assert.ok(secondaryIndex > nextStepIndex, '积分和课程等次级信息应排在匹配资格动作之后')
  assert.match(dashboardSource, /GATE_STEPS\.find\(step => !qualification\[step\.key\]\)/)
})

test('check-in keeps explicit pending, busy, and completed states', () => {
  assert.match(dashboardSource, /data-checkin-status=\{checkedIn \? 'complete' : 'pending'\}/)
  assert.match(dashboardSource, /disabled=\{checkedIn \|\| checkinBusy\}/)
  assert.match(dashboardSource, /checkinBusy \? '签到中…' : checkedIn \? '已签到'/)
})

test('dashboard layout can shrink without horizontal overflow on mobile', () => {
  assert.match(dashboardSource, /import '\.\/Dashboard\.css'/)
  assert.match(dashboardCss, /\.dashboard-page\s*\{[^}]*min-width:\s*0/s)
  assert.match(dashboardCss, /\.dashboard-next-action\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s)
  assert.match(dashboardCss, /@media\s*\(max-width:\s*768px\)[\s\S]*\.dashboard-next-action\s*\{[^}]*grid-template-columns:\s*1fr/s)
  assert.match(dashboardCss, /@media\s*\(max-width:\s*768px\)[\s\S]*\.dashboard-next-action\s+\.btn\s*\{[^}]*width:\s*100%/s)
})
