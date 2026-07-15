import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(__dirname, 'Admin.jsx'), 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}()`)
  const end = nextName ? source.indexOf(`function ${nextName}`, start) : source.length
  return source.slice(start, end)
}

const vipSubscriptions = functionSource('VipSubscriptionsTab', 'SettingsTab')
const endorsements = functionSource('EndorsementsTab', 'PointsAdjuster')
const reports = functionSource('ReportsTab', 'ApplicationsTab')

test('VIP filtering ignores responses from older requests', () => {
  assert.match(vipSubscriptions, /vipSubscriptionsRequest\s*=\s*useRef\(0\)/)
  assert.match(vipSubscriptions, /const requestId = \+\+vipSubscriptionsRequest\.current/)
  assert.match(vipSubscriptions, /await admin\.vipSubscriptions\(nextState\)[\s\S]*if \(requestId !== vipSubscriptionsRequest\.current\) return[\s\S]*setItems/)
  assert.match(vipSubscriptions, /catch \(err\) \{\s*if \(requestId !== vipSubscriptionsRequest\.current\) return/)
})

test('endorsement filtering lets only the latest request publish state', () => {
  assert.match(endorsements, /endorsementsRequest\s*=\s*useRef\(0\)/)
  assert.match(endorsements, /const requestId = \+\+endorsementsRequest\.current/)
  assert.match(endorsements, /await admin\.endorsements\(nextState\)[\s\S]*if \(requestId !== endorsementsRequest\.current\) return[\s\S]*setItems/)
  assert.match(endorsements, /catch \(err\) \{\s*if \(requestId !== endorsementsRequest\.current\) return/)
  assert.match(endorsements, /finally \{\s*if \(requestId === endorsementsRequest\.current\) setLoading\(false\)/)
})

test('report filtering ignores responses from older requests', () => {
  assert.match(reports, /reportsRequest\s*=\s*useRef\(0\)/)
  assert.match(reports, /const requestId = \+\+reportsRequest\.current/)
  assert.match(reports, /await admin\.reports\(nextState\)[\s\S]*if \(requestId !== reportsRequest\.current\) return[\s\S]*setReports/)
  assert.match(reports, /catch \(err\) \{\s*if \(requestId !== reportsRequest\.current\) return/)
})

test('review completion refreshes the latest selected filter instead of its stale render state', () => {
  for (const section of [vipSubscriptions, endorsements, reports]) {
    assert.match(section, /const stateRef = useRef\(state\)/)
    assert.match(section, /stateRef\.current = state/)
    assert.match(section, /await load\(stateRef\.current\)/)
    assert.doesNotMatch(section, /await load\(\)/)
  }
})
