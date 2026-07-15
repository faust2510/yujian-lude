import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'AuthProvider.jsx'),
  'utf8',
)

test('auth recovery treats only 401 as signed out', () => {
  assert.match(source, /error\?\.response\?\.status === 401/)
  assert.match(source, /if \(error\?\.response\?\.status === 401\) \{[\s\S]*setUser\(null\)/)
  assert.doesNotMatch(source, /\.catch\(\(\) => setUser\(null\)\)/)
})

test('auth recovery exposes a clear retry state for transient failures', () => {
  assert.match(source, /const \[recoveryError, setRecoveryError\] = useState\(null\)/)
  assert.match(source, /认证状态恢复失败/)
  assert.match(source, /onClick=\{retryRecovery\}/)
  assert.match(source, /isRetrying \? '正在重试…' : '重新尝试'/)
})

test('successful auth responses retain the complete user including nickname', () => {
  assert.match(source, /const nextUser = r\.data\.user/)
  assert.match(source, /setUser\(nextUser\)/)
  assert.doesNotMatch(source, /email\.split/)
})

test('stale me responses cannot overwrite login, registration, or logout state', () => {
  assert.match(source, /const refreshRequest = useRef\(0\)/)
  assert.match(source, /const requestId = \+\+refreshRequest\.current/)
  assert.match(source, /requestId !== refreshRequest\.current/)
  assert.ok((source.match(/refreshRequest\.current \+= 1/g) || []).length >= 3)
  assert.match(source, /const login = async[\s\S]*refreshRequest\.current \+= 1[\s\S]*setRecoveryError\(null\)/)
  assert.match(source, /const register = async[\s\S]*refreshRequest\.current \+= 1[\s\S]*setRecoveryError\(null\)/)
  assert.match(source, /const logout = async[\s\S]*refreshRequest\.current \+= 1/)
})
