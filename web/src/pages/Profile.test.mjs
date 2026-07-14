import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'Profile.jsx'),
  'utf8',
)

test('profile keeps the returned exposure score synchronized after either save', () => {
  assert.match(source, /const \[exposure, setExposure\] = useState\(null\)/)
  assert.match(source, /setExposure\(r\.data\.exposure \?\? null\)/)
  assert.equal((source.match(/setExposure\(r\.data\?\.exposure \?\? null\)/g) || []).length, 2)
  assert.match(source, /当前曝光分/)
})
