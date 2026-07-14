import assert from 'node:assert/strict'
import test from 'node:test'

import { MAIN_SECTIONS, USER_MENU_ITEMS, resolvePrimarySection } from './navigation.js'

test('MAIN_SECTIONS has the required navigation configuration', () => {
  assert.deepEqual(MAIN_SECTIONS, [
    { key: 'home', label: '首页', to: '/', match: ['/'] },
    { key: 'meet', label: '认识', to: '/match', match: ['/match', '/chat', '/relationships'] },
    { key: 'grow', label: '成长', to: '/courses', match: ['/courses', '/textbooks', '/ai'] },
    { key: 'community', label: '社区', to: '/community', match: ['/community'] },
  ])

  assert.equal(MAIN_SECTIONS.some((section) => section.to === '/profile'), false)
})

test('USER_MENU_ITEMS has the required destination order', () => {
  assert.deepEqual(USER_MENU_ITEMS.map((item) => item.to), [
    '/profile',
    '/faith-test',
    '/vip',
  ])
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
    ],
    community: ['/community', '/community/user/example'],
  }

  for (const [section, paths] of Object.entries(pathsBySection)) {
    for (const pathname of paths) {
      assert.equal(resolvePrimarySection(pathname), section, pathname)
    }
  }
})

test('resolvePrimarySection returns null for unknown paths', () => {
  assert.equal(resolvePrimarySection('/unknown'), null)
  assert.equal(resolvePrimarySection('/faith-test'), null)
  assert.equal(resolvePrimarySection('/faith-test/result'), null)
})
