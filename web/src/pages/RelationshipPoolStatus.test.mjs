import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const dashboard = readFileSync(path.join(dir, 'Dashboard.jsx'), 'utf8')
const match = readFileSync(path.join(dir, 'Match.jsx'), 'utf8')

test('dashboard turns an active relationship into a coherent next action', () => {
  assert.match(dashboard, /qualification\.relationshipBlocked/)
  assert.match(dashboard, /label: '关系进行中'/)
  assert.match(dashboard, /to: '\/relationships'/)
  assert.match(dashboard, /action: '查看关系'/)
  assert.match(dashboard, /qualification\.relationshipBlocked \? '关系进行中'/)
})

test('match locked state explains relationship exclusivity instead of missing qualifications', () => {
  assert.match(match, /lockedStatus\.relationshipBlocked/)
  assert.match(match, /关系进行中/)
  assert.match(match, /navigate\('\/relationships'\)/)
  assert.match(match, /查看关系/)
})
