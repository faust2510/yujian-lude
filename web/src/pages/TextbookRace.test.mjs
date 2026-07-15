import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const textbooksSource = readFileSync(fileURLToPath(new URL('./Textbooks.jsx', import.meta.url)), 'utf8')
const readerSource = readFileSync(fileURLToPath(new URL('./TextbookReader.jsx', import.meta.url)), 'utf8')

test('only the latest textbook detail request can publish route state', () => {
  assert.match(textbooksSource, /const detailRequest = useRef\(0\)/)
  assert.match(textbooksSource, /const requestId = \+\+detailRequest\.current/)
  assert.match(textbooksSource, /if \(requestId !== detailRequest\.current\) return\s+setDetail\(res\.data\)/)
  assert.match(textbooksSource, /if \(requestId !== detailRequest\.current\) return\s+setError\(err\.response/)
  assert.match(textbooksSource, /if \(requestId === detailRequest\.current\) setDetailLoading\(false\)/)
})

test('starting a textbook detail request clears the previous textbook', () => {
  assert.match(textbooksSource, /setDetail\(null\)\s+setDetailLoading\(true\)/)
})

test('only the latest chapter request can publish route state', () => {
  assert.match(readerSource, /const chapterRequest = useRef\(0\)/)
  assert.match(readerSource, /const requestId = \+\+chapterRequest\.current/)
  assert.match(readerSource, /if \(requestId !== chapterRequest\.current\) return\s+setData\(res\.data\)/)
  assert.match(readerSource, /if \(requestId !== chapterRequest\.current\) return\s+setError\(err\.response/)
  assert.match(readerSource, /if \(requestId === chapterRequest\.current\) setLoading\(false\)/)
})

test('starting a chapter request clears the previous chapter', () => {
  assert.match(readerSource, /setData\(null\)\s+setLoading\(true\)/)
})

test('markRead submits and updates only the successfully loaded chapter identity', () => {
  assert.match(readerSource, /const loadedChapter = useRef\(null\)/)
  assert.match(readerSource, /loadedChapter\.current = \{ slug, index \}/)
  assert.match(readerSource, /const chapter = loadedChapter\.current/)
  assert.match(readerSource, /if \(!chapter\) return/)
  assert.match(readerSource, /textbooks\.markRead\(chapter\.slug, chapter\.index\)/)
  assert.match(readerSource, /loadedChapter\.current !== chapter/)
})

test('a failed chapter load offers retry and a route back to the textbook directory', () => {
  assert.match(readerSource, /const retryChapter = \(\) =>/)
  assert.match(readerSource, /onClick=\{retryChapter\}[\s\S]*重试/)
  assert.match(readerSource, /返回教材目录/)
  assert.match(readerSource, /navigate\(returnTo \|\| `\/textbooks\/\$\{slug\}`\)/)
})
