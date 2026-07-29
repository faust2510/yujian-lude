import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(dirname, 'Profile.jsx'), 'utf8')

test('profile editor exposes a bounded signature and authenticated avatar upload controls', () => {
  assert.match(source, /profile\.uploadAvatar/)
  assert.match(source, /个人签名/)
  assert.match(source, /maxLength=\{80\}/)
})
