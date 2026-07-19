import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const readSource = (filePath) => existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
const layoutSource = readSource(path.join(__dirname, 'AppLayout.jsx'))
const uiSource = readSource(path.join(__dirname, 'FigmaUi.jsx'))
const cssSource = readSource(path.join(__dirname, '..', 'figma-ui.css'))

test('application layout exposes the accepted Figma shell regions', () => {
  assert.match(layoutSource, /figma-app-shell/)
  assert.match(layoutSource, /figma-sidebar/)
  assert.match(layoutSource, /figma-right-rail/)
  assert.match(layoutSource, /figma-mobile-nav/)
  assert.match(layoutSource, /首页/)
  assert.match(layoutSource, /认识/)
  assert.match(layoutSource, /成长/)
  assert.match(layoutSource, /社区/)
  assert.match(layoutSource, /消息/)
})

test('layout preserves existing routes, role visibility, outlet, and async logout flow', () => {
  for (const route of ['/', '/profile', '/faith-test', '/courses', '/course-authoring', '/textbooks', '/match', '/ai', '/relationships', '/chat', '/community', '/vip', '/admin']) {
    assert.match(layoutSource, new RegExp(`(?:to=|to:\\s*)["']${route.replaceAll('/', '\\/')}["']`))
  }

  assert.match(layoutSource, /user\?\.role === 'pastor' \|\| user\?\.role === 'admin'/)
  assert.match(layoutSource, /user\?\.role === 'admin'/)
  assert.match(layoutSource, /await logout\(\)[\s\S]*?navigate\('\/login'\)/)
  assert.match(layoutSource, /<Outlet\s*\/>/)
  assert.doesNotMatch(layoutSource, /<NavLink to="\/pastor"/)
})

test('mobile header keeps secondary routes and logout reachable beyond the five-item bottom nav', () => {
  assert.match(layoutSource, /figma-mobile-menu[\s\S]*?to="\/profile"[\s\S]*?to="\/faith-test"[\s\S]*?to="\/textbooks"[\s\S]*?to="\/ai"[\s\S]*?to="\/relationships"[\s\S]*?to="\/vip"/)
  assert.match(layoutSource, /figma-mobile-menu[\s\S]*?to="\/course-authoring"[\s\S]*?to="\/admin"[\s\S]*?onClick=\{handleLogout\}/)
})

test('Figma shell locks the accepted desktop dimensions and mobile navigation height', () => {
  assert.match(cssSource, /--figma-artboard-width:\s*1440px/)
  assert.match(cssSource, /--figma-artboard-height:\s*1024px/)
  assert.match(cssSource, /--figma-mobile-width:\s*390px/)
  assert.match(cssSource, /--figma-mobile-height:\s*844px/)
  assert.match(cssSource, /--figma-sidebar:\s*236px/)
  assert.match(cssSource, /--figma-main:\s*900px/)
  assert.match(cssSource, /--figma-rail:\s*304px/)
  assert.match(cssSource, /\.figma-app-shell[\s\S]*?grid-template-columns:\s*var\(--figma-sidebar\)\s+minmax\(0,\s*var\(--figma-main\)\)\s+var\(--figma-rail\)/)
  assert.match(cssSource, /\.figma-app-shell[\s\S]*?\.figma-mobile-nav\s*\{[^}]*height:\s*74px/s)
})

test('Figma shell carries the accepted relationship design palette', () => {
  for (const color of ['#6E1F35', '#471321', '#F7EFF2', '#F1E4E8', '#A8864A', '#F8F4EB', '#FCFAF5', '#fff', '#F7F8F9', '#DED8D5', '#251F22', '#5F555A', '#81777B']) {
    assert.match(cssSource, new RegExp(color, 'i'))
  }
})

test('shared Figma UI primitives and production SVG icons are exported', () => {
  for (const component of [
    'FigmaIcon',
    'FigmaPageHeader',
    'FigmaTabs',
    'FigmaCard',
    'FigmaPersonRow',
    'FigmaNotice',
  ]) {
    assert.match(uiSource, new RegExp(`export function ${component}`))
  }

  assert.match(uiSource, /<svg/)
  assert.match(uiSource, /<path/)
  assert.doesNotMatch(uiSource, /[😀-🙏]/u)
})
