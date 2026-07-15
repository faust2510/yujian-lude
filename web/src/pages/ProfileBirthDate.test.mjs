import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'Profile.jsx'), 'utf8')

test('profile collects a complete birth date and explains the adult matching requirement', () => {
  assert.match(source, /birth_date:''/)
  assert.match(source, /<label>出生日期<\/label><input type="date" value=\{form\.birth_date\|\|''\}/)
  assert.match(source, /仅年满 18 周岁可参与匹配/)
  assert.doesNotMatch(source, /<label>出生年份<\/label>/)
})
