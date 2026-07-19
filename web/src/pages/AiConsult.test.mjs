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
  assert.match(pageSource, /historyError/)
  assert.match(pageSource, /ai-history-error/)
  assert.match(pageSource, /role="alert"/)
  assert.match(pageSource, /onClick=\{loadHistory\}/)
  assert.match(cssSource, /\.ai-page/)
  assert.match(cssSource, /\.ai-prompt-chip/)
  assert.match(cssSource, /\.ai-boundary-panel/)
})
