import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./Profile.jsx', import.meta.url)), 'utf8')

test('profile and faith forms stay read-only until the initial profile load succeeds', () => {
  assert.match(source, /const \[profileLoadState, setProfileLoadState\] = useState\('loading'\)/)
  assert.match(source, /setProfileLoadState\('ready'\)/)
  assert.match(source, /setProfileLoadState\('error'\)/)
  assert.match(source, /if \(profileLoadState !== 'ready'\) return/)
  assert.match(source, /<fieldset[^>]*disabled=\{profileLoadState !== 'ready'/)
})

test('failed profile loads expose an in-page retry instead of enabling empty saves', () => {
  assert.match(source, /profileLoadState === 'error'/)
  assert.match(source, /onClick=\{loadProfile\}>重新加载<\/button>/)
  assert.match(source, /disabled=\{busy\.profile \|\| profileLoadState !== 'ready'\}/)
  assert.match(source, /disabled=\{busy\.faith \|\| profileLoadState !== 'ready'\}/)
})
