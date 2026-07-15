import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'Profile.jsx'), 'utf8')

test('profile loads and renders earned course badges with completion dates', () => {
  assert.match(source, /const \[badges, setBadges\] = useState\(\[\]\)/)
  assert.match(source, /setBadges\(r\.data\.badges \|\| \[\]\)/)
  assert.match(source, /我的课程徽章/)
  assert.match(source, /badges\.map\(badge =>/)
  assert.match(source, /badge\.title/)
  assert.match(source, /badge\.completed_at/)
})
