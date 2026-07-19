import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cssSource = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8')

test('community mobile layout prevents horizontal overflow', () => {
  const mobileBlock = cssSource.match(/@media \(max-width: 767px\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(mobileBlock, /\.com-layout\s*\{[^}]*width:\s*100%/s)
  assert.match(mobileBlock, /\.com-main\s*\{[^}]*max-width:\s*100%/s)
  assert.match(mobileBlock, /\.com-tabs\s*\{[^}]*flex-wrap:\s*wrap/s)
  assert.match(mobileBlock, /\.com-composer-row\s*\{[^}]*min-width:\s*0/s)
})
