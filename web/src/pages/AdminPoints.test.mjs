import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const api = read('api/client.js')
const adminPage = read('pages/Admin.jsx')

test('admin API posts signed points adjustments with a required reason', () => {
  assert.match(api, /adjustPoints:\s*\(id, amount, reason\) =>/)
  assert.match(api, /api\.post\(`\/admin\/users\/\$\{id\}\/points`, \{ amount, reason \}\)/)
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
})
