import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientSource = readFileSync(path.join(__dirname, '..', 'api', 'client.js'), 'utf8')
const mainSource = readFileSync(path.join(__dirname, '..', 'main.jsx'), 'utf8')
const layoutSource = readFileSync(path.join(__dirname, '..', 'components', 'AppLayout.jsx'), 'utf8')
const cssSource = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8')

test('textbook API client exposes list detail chapter and markRead calls', () => {
  assert.match(clientSource, /export const textbooks/)
  assert.match(clientSource, /api\.get\('\/textbooks'\)/)
  assert.match(clientSource, /api\.get\(`\/textbooks\/\$\{slug\}`\)/)
  assert.match(clientSource, /api\.get\(`\/textbooks\/\$\{slug\}\/chapters\/\$\{index\}`\)/)
  assert.match(clientSource, /api\.post\(`\/textbooks\/\$\{slug\}\/chapters\/\$\{index\}\/read`\)/)
})

test('textbook routes are protected under the app basename', () => {
  assert.match(mainSource, /import Textbooks from '\.\/pages\/Textbooks'/)
  assert.match(mainSource, /import TextbookReader from '\.\/pages\/TextbookReader'/)
  assert.match(mainSource, /path="\/textbooks"/)
  assert.match(mainSource, /path="\/textbooks\/:slug"/)
  assert.match(mainSource, /path="\/textbooks\/:slug\/chapters\/:index"/)
  assert.match(layoutSource, /to="\/textbooks"/)
  assert.match(layoutSource, />教材</)
})

test('textbook pages and reader styles are present and mobile safe', () => {
  const textbooksSource = readFileSync(path.join(__dirname, 'Textbooks.jsx'), 'utf8')
  const readerSource = readFileSync(path.join(__dirname, 'TextbookReader.jsx'), 'utf8')
  const mobileBlock = cssSource.match(/@media \(max-width: 768px\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(textbooksSource, /教材库/)
  assert.match(textbooksSource, /textbooks\.list/)
  assert.match(textbooksSource, /textbooks\.detail/)
  assert.match(readerSource, /dangerouslySetInnerHTML/)
  assert.match(readerSource, /textbooks\.markRead/)
  assert.match(cssSource, /\.textbook-list/)
  assert.match(cssSource, /\.textbook-reader/)
  assert.match(cssSource, /\.reader-body\s*\{[^}]*max-width:\s*760px/s)
  assert.match(cssSource, /\.reader-body\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(mobileBlock, /\.textbook-shell\s*\{[^}]*grid-template-columns:\s*1fr/s)
})
