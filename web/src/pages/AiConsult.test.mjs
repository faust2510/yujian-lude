import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pageSource = readFileSync(path.join(__dirname, 'AiConsult.jsx'), 'utf8')
const cssSource = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8')

test('AI consult page exposes a consultation desk layout', () => {
  assert.match(pageSource, /ai-page/)
  assert.match(pageSource, /咨询边界/)
  assert.match(pageSource, /最近咨询/)
  assert.match(pageSource, /参考依据/)
  assert.match(pageSource, /safeGuidancePrompts/)
  assert.match(cssSource, /\.ai-page/)
  assert.match(cssSource, /\.ai-prompt-chip/)
  assert.match(cssSource, /\.ai-boundary-panel/)
})

test('history loading exposes loading, error, and retry states without disguising errors as empty history', () => {
  assert.match(pageSource, /historyLoading/)
  assert.match(pageSource, /historyError/)
  assert.match(pageSource, /最近咨询加载失败，请稍后重试/)
  assert.match(pageSource, /onClick=\{loadHistory\}>重试<\/button>/)
  assert.match(pageSource, /historyLoading && <p className="muted-small">加载中…<\/p>/)
  assert.match(pageSource, /!historyLoading && !historyError && history\.length === 0/)
  assert.doesNotMatch(pageSource, /catch[^}]*\{[^}]*setHistory\(\[\]\)/s)
})

test('only the latest history request may publish records, errors, or loading state', () => {
  assert.match(pageSource, /historyRequest\s*=\s*useRef\(0\)/)
  assert.match(pageSource, /const requestId = \+\+historyRequest\.current/)
  assert.match(pageSource, /await ai\.history\(\)[\s\S]*if \(requestId !== historyRequest\.current\) return[\s\S]*setHistory/)
  assert.match(pageSource, /catch \(err\) \{\s*if \(requestId !== historyRequest\.current\) return/)
  assert.match(pageSource, /finally \{\s*if \(requestId === historyRequest\.current\) setHistoryLoading\(false\)/)
})
