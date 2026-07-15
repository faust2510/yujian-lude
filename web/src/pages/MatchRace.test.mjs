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
