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

const primaryNavSource = layoutSource.match(/const primaryNav = \[([\s\S]*?)\n\]/)?.[1] || ''
const desktopRailByRouteSource = layoutSource.match(/const desktopRailByRoute\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const desktopMediaSource = cssSource.match(/@media \(min-width:\s*769px\)\s*\{([\s\S]*)$/)?.[1] || ''
const unscopedCssSource = cssSource.split('@media')[0]

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

test('Figma main column does not inherit the legacy main-content box model', () => {
  assert.doesNotMatch(layoutSource, /className="(?:[^"]*\s)?main-content(?:\s[^"]*)?"/)
  assert.match(layoutSource, /<main className="figma-main">/)
})

test('fixed desktop sidebar keeps explicit space in the three-column grid', () => {
  assert.match(cssSource, /\.figma-app-shell \.figma-sidebar\s*\{[^}]*position:\s*fixed/s)
  assert.match(cssSource, /\.figma-app-shell \.figma-sidebar\s*\{[^}]*width:\s*var\(--figma-sidebar\)/s)
  assert.match(cssSource, /\.figma-app-shell \.figma-main\s*\{[^}]*grid-column:\s*2/s)
  assert.match(cssSource, /\.figma-app-shell \.figma-right-rail\s*\{[^}]*grid-column:\s*3/s)
})

test('1440 three-column geometry is owned by the desktop media scope', () => {
  assert.ok(
    /@media \(min-width:\s*769px\)/.test(cssSource),
    'desktop CSS must define an explicit min-width: 769px scope',
  )
  assert.ok(
    /\.figma-app-shell\s*\{[^}]*grid-template-columns:\s*var\(--figma-sidebar\)\s+minmax\(0,\s*var\(--figma-main\)\)\s+var\(--figma-rail\)/s.test(desktopMediaSource),
    'the 236/900/304 grid must be declared inside the desktop scope',
  )
  assert.ok(
    !/grid-template-columns:\s*var\(--figma-sidebar\)\s+minmax\(0,\s*var\(--figma-main\)\)\s+var\(--figma-rail\)/.test(unscopedCssSource),
    'the desktop grid must not be an unscoped base rule',
  )
})

test('desktop sidebar has exactly five primary destinations and a real profile completion affordance', () => {
  const labels = [...primaryNavSource.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1])
  const destinations = [...primaryNavSource.matchAll(/to:\s*'([^']+)'/g)].map((match) => match[1])

  assert.deepEqual(labels, ['首页', '认识', '成长', '社区', '消息'])
  assert.deepEqual(destinations, ['/', '/match', '/courses', '/community', '/chat'])
  assert.ok(layoutSource.includes('figma-profile-completion'), 'sidebar must expose a profile completion marker')
  assert.ok(layoutSource.includes('资料完整度'), 'sidebar must label the profile completion value')
})

test('desktop recommendations never ship fixed prototype scores or group counts', () => {
  for (const fabricatedValue of ['92%', '88%', '84%', '128 人', '46 人', '92 人']) {
    assert.ok(!layoutSource.includes(fabricatedValue), `remove fixed prototype value: ${fabricatedValue}`)
  }
})

test('desktop right rail is route-aware and avoids fabricated metrics', () => {
  assert.ok(desktopRailByRouteSource, 'define an explicit desktopRailByRoute map')
  for (const route of ['/', '/match', '/courses', '/community', '/chat', '/profile', '/ai', '/vip']) {
    assert.ok(
      new RegExp(`['"]${route.replaceAll('/', '\\/')}['"]\\s*:`).test(desktopRailByRouteSource),
      `desktop rail map must cover ${route}`,
    )
  }
  assert.ok(!/[0-9]+%/.test(desktopRailByRouteSource), 'right rail must not ship fixed match scores')
})

test('layout preserves existing routes, role visibility, outlet, and async logout flow', () => {
  for (const route of ['/', '/profile', '/faith-test', '/courses', '/course-authoring', '/textbooks', '/match', '/ai', '/relationships', '/chat', '/community', '/vip', '/admin']) {
    assert.match(layoutSource, new RegExp(`(?:to=|to:\\s*)["']${route.replaceAll('/', '\\/')}["']`))
  }

  assert.match(layoutSource, /roles:\s*\['pastor', 'admin'\]/)
  assert.match(layoutSource, /roles:\s*\['admin'\]/)
  assert.match(layoutSource, /visibleSecondaryNav\(user\?\.role\)/)
  assert.match(layoutSource, /await logout\(\)[\s\S]*?navigate\('\/login'\)/)
  assert.match(layoutSource, /<Outlet\s*\/>/)
  assert.doesNotMatch(layoutSource, /<NavLink to="\/pastor"/)
})

test('mobile header keeps secondary routes and logout reachable beyond the five-item bottom nav', () => {
  assert.match(layoutSource, /const secondaryNav = \[[\s\S]*?\/profile[\s\S]*?\/faith-test[\s\S]*?\/textbooks[\s\S]*?\/ai[\s\S]*?\/relationships[\s\S]*?\/vip[\s\S]*?\/course-authoring[\s\S]*?\/admin/)
  assert.match(layoutSource, /figma-mobile-menu[\s\S]*?secondaryItems\.map[\s\S]*?setMobileMenuOpen\(false\)/)
  assert.match(layoutSource, /handleLogout/)
})

test('small Figma chrome text uses AA-safe foreground tokens', () => {
  assert.match(cssSource, /--figma-gold-text:\s*#6F5427/i)
  assert.match(cssSource, /--figma-muted-text:\s*#6D6367/i)
  assert.match(cssSource, /\.figma-eyebrow[\s\S]*?color:\s*var\(--figma-gold-text\)/)
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
