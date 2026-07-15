import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const api = read('api/client.js')
const adminPage = read('pages/Admin.jsx')
const adminCss = read('pages/Admin.css')

test('admin API posts signed points adjustments with a required reason', () => {
  assert.match(api, /adjustPoints:\s*\(id, amount, reason, operationId\) =>/)
  assert.match(api, /api\.post\(`\/admin\/users\/\$\{id\}\/points`, \{ amount, reason, operation_id: operationId \}\)/)
})

test('user list offers compact add and subtract controls with inline feedback', () => {
  assert.match(adminPage, /function PointsAdjuster/)
  assert.match(adminPage, /u\.earned_points/)
  assert.match(adminPage, /placeholder="原因（必填）"/)
  assert.match(adminPage, />加分<\/ActionButton>/)
  assert.match(adminPage, />扣分<\/ActionButton>/)
  assert.match(adminPage, /admin\.adjustPoints/)
  assert.match(adminPage, /setFeedback/)
  assert.match(adminPage, /积分已更新/)
  assert.match(adminPage, /operationRef\s*=\s*useRef/)
  assert.match(adminPage, /crypto\.randomUUID\(\)/)
  assert.match(adminPage, /admin\.adjustPoints\(user\.id, direction \* value, normalizedReason, operationId\)/)
})

test('user filtering ignores stale responses and points controls shrink on narrow screens', () => {
  assert.match(adminPage, /usersRequest\s*=\s*useRef\(0\)/)
  assert.match(adminPage, /requestId\s*=\s*\+\+usersRequest\.current/)
  assert.match(adminPage, /if \(requestId !== usersRequest\.current\) return/)
  assert.match(adminPage, /className="admin-points-adjuster"/)
  assert.match(adminCss, /@media\s*\(max-width:\s*640px\)[\s\S]*\.admin-points-adjuster\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s)
})
