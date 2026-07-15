import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./Match.jsx', import.meta.url)), 'utf8')

test('only the latest candidate request can publish filters, errors, or loading state', () => {
  assert.match(source, /const candidatesRequest = useRef\(0\)/)
  assert.match(source, /const requestId = \+\+candidatesRequest\.current/)
  assert.match(source, /\.then\(r => \{\s*if \(requestId !== candidatesRequest\.current\) return/)
  assert.match(source, /\.catch\(\(err\) => \{\s*if \(requestId !== candidatesRequest\.current\) return/)
  assert.match(source, /\.finally\(\(\) => \{\s*if \(requestId === candidatesRequest\.current\) setLoading\(false\)/)
})

test('unmounting invalidates the active candidate request', () => {
  assert.match(source, /return \(\) => \{ candidatesRequest\.current \+= 1 \}/)
})

test('opening candidate details and interacting both record a profile view', () => {
  assert.match(source, /const recordView = async \(id\) =>/)
  assert.match(source, /await matches\.view\(id\)/)
  assert.match(source, /const toggleDetails = \(id\) =>/)
  assert.match(source, /recordView\(id\)/)
  assert.match(source, /const express = async \(id, intent\) => \{\s*recordView\(id\)/)
})

test('VIP viewers are loaded and rendered without treating a 403 upsell as a crash', () => {
  assert.match(source, /matches\.viewers\(\)/)
  assert.match(source, /err\.response\?\.status === 403/)
  assert.match(source, /setViewersUpsell\(true\)/)
  assert.match(source, /谁看过我/)
  assert.match(source, /升级 VIP/)
  assert.match(source, /viewers\.map\(/)
})

test('viewer loading resets on entitlement downgrade and transient failures are retryable', () => {
  assert.match(source, /const loadViewers = useCallback/)
  assert.match(source, /if \(!user\?\.is_vip\) \{[\s\S]*setViewersLoading\(false\)[\s\S]*setViewersUpsell\(true\)/)
  assert.match(source, /onClick=\{loadViewers\}[\s\S]*重试/)
  assert.match(source, /const viewersRequest = useRef\(0\)/)
  assert.match(source, /requestId !== viewersRequest\.current/)
})
