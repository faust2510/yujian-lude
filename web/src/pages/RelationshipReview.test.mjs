import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const api = read('api/client.js')
const pastor = read('pages/Pastor.jsx')
const relationships = read('pages/Relationships.jsx')

test('relationship reviews have a dedicated API and referrer workbench queue', () => {
  assert.match(api, /export const relationshipReviews =/)
  assert.match(api, /api\.get\('\/relationship-reviews'\)/)
  assert.match(api, /api\.post\(`\/relationships\/\$\{id\}\/pastor-approve`/)
  assert.match(pastor, /relationshipReviews\.list\(\)/)
  assert.match(pastor, /关系确认待办/)
  assert.match(pastor, /确认该侧/)
  assert.match(pastor, /review\.relationship_id !== item\.relationship_id/)
  assert.doesNotMatch(pastor, /review\.relationship_id !== item\.relationship_id \|\| review\.side !== item\.side/)
})

test('relationship participants can observe review state but cannot self-review in their page', () => {
  assert.doesNotMatch(relationships, /relationships\.pastorApprove/)
  assert.doesNotMatch(relationships, /确认甲方属灵审核/)
  assert.doesNotMatch(relationships, /确认乙方属灵审核/)
  assert.match(relationships, /我方引荐人 \/ 管理员已确认/)
  assert.match(relationships, /对方引荐人 \/ 管理员已确认/)
})
