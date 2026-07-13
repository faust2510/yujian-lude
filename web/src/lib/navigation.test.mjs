import assert from 'node:assert/strict'
import test from 'node:test'

import { MAIN_SECTIONS, resolvePrimarySection } from './navigation.js'

test('MAIN_SECTIONS has the required keys in order', () => {
  assert.deepEqual(
    MAIN_SECTIONS.map((section) => section.key),
    ['home', 'meet', 'grow', 'community'],
  )
})

test('resolvePrimarySection maps paths to their primary sections', () => {
  const pathsBySection = {
    home: ['/'],
    meet: ['/match', '/match/profile', '/chat', '/chat/room/1', '/relationships', '/relationships/1'],
    grow: [
      '/courses',
      '/courses/1',
      '/textbooks',
      '/textbooks/1/chapters/2',
      '/ai',
      '/ai/session',
      '/faith-test',
      '/faith-test/result',
    ],
    community: ['/community', '/community/users/1'],
  }

  for (const [section, paths] of Object.entries(pathsBySection)) {
    for (const pathname of paths) {
      assert.equal(resolvePrimarySection(pathname), section, pathname)
    }
  }
})

test('resolvePrimarySection returns null for unknown paths', () => {
  assert.equal(resolvePrimarySection('/unknown'), null)
})
