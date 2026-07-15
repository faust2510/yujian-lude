import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./FaithTest.jsx', import.meta.url)), 'utf8')

test('the faith test page distinguishes the latest score from durable qualification', () => {
  assert.match(source, /qualified: r\.data\.qualified/)
  assert.match(source, /const qualified = status\?\.qualified \|\| latest\?\.passed/)
  assert.match(source, /\{qualified \? \(/)
})
