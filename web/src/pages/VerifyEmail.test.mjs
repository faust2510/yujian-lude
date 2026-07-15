import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./VerifyEmail.jsx', import.meta.url)), 'utf8')

test('email verification is single-flight for the same one-time token', () => {
  assert.match(source, /const startedToken = useRef\(''\)/)
  assert.match(source, /if \(startedToken\.current === token\) return/)
  assert.match(source, /startedToken\.current = token/)
})

test('refresh failures after verification preserve the successful verification result', () => {
  assert.match(source, /await auth\.verifyEmail\(token\)/)
  assert.match(source, /setState\(\{ loading: false, error: '', ok: true,/)
  assert.match(source, /catch \{[\s\S]{0,240}账户状态稍后刷新/)

  const verificationCatch = source.indexOf("邮箱验证失败")
  const refreshWarning = source.indexOf('账户状态稍后刷新')
  assert.ok(verificationCatch > refreshWarning, 'token failure handling must be separate from refresh warnings')
})
