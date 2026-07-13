import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const srcDir = path.resolve(import.meta.dirname, '..')
const uiDir = path.join(srcDir, 'components', 'ui')

async function findLegacyMutedReferences(directory) {
  const matches = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (filePath !== uiDir) {
        matches.push(...await findLegacyMutedReferences(filePath))
      }
      continue
    }

    if (!entry.isFile() || !/\.(jsx|js)$/.test(entry.name)) continue

    const source = await readFile(filePath, 'utf8')
    if (source.includes('var(--muted)')) {
      matches.push(path.relative(srcDir, filePath))
    }
  }

  return matches.sort()
}

test('business source does not use the shadcn muted background token as text', async () => {
  const matches = await findLegacyMutedReferences(srcDir)

  assert.deepEqual(matches, [], `Found var(--muted) in:\n${matches.join('\n')}`)
})
