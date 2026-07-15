import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const pageUrl = new URL('./NotFound.jsx', import.meta.url)
const main = readFileSync(fileURLToPath(new URL('../main.jsx', import.meta.url)), 'utf8')

test('unknown protected app routes render a real recovery page', () => {
  assert.ok(existsSync(fileURLToPath(pageUrl)))
  const page = readFileSync(fileURLToPath(pageUrl), 'utf8')
  assert.match(main, /import NotFound from '\.\/pages\/NotFound'/)
  assert.match(main, /<Route path="\*" element=\{<NotFound \/>\} \/>/)
  assert.match(page, /页面没有找到/)
  assert.match(page, /to="\/"/)
  assert.match(page, /回到首页/)
})
