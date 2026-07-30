import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const page = (name) => readFileSync(path.join(__dirname, `${name}.jsx`), 'utf8')
const css = readFileSync(path.join(__dirname, '..', 'figma-ui.css'), 'utf8')
const layout = readFileSync(path.join(__dirname, '..', 'components', 'AppLayout.jsx'), 'utf8')
const ui = readFileSync(path.join(__dirname, '..', 'components', 'FigmaUi.jsx'), 'utf8')

const markers = {
  Dashboard: 'figma-home-feed',
  Match: 'figma-daily-picks',
  Courses: 'figma-growth-feed',
  Community: 'figma-community-feed',
  Chat: 'figma-letter-workspace',
  Profile: 'figma-profile-sheet',
  AiConsult: 'figma-ai-workbench',
  Vip: 'figma-membership-grid',
}

const desktopSectionMarkers = {
  Dashboard: 'figma-desktop-home-section',
  Match: 'figma-desktop-match-section',
  Courses: 'figma-desktop-growth-section',
  Community: 'figma-desktop-community-section',
  Chat: 'figma-desktop-chat-section',
  Profile: 'figma-desktop-profile-section',
  AiConsult: 'figma-desktop-ai-section',
  Vip: 'figma-desktop-vip-section',
}

for (const [file, marker] of Object.entries(markers)) {
  test(`${file} exposes its Figma core screen`, () => {
    assert.match(page(file), new RegExp(marker))
    assert.match(css, new RegExp(`\\.${marker}`))
  })
}

for (const [file, marker] of Object.entries(desktopSectionMarkers)) {
  test(`${file} exposes a desktop-only section marker`, () => {
    assert.ok(page(file).includes(marker), `${file} must expose ${marker}`)
  })
}

test('Figma core screens share mobile-safe content rules', () => {
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.figma-core-screen[^}]*overflow-x:\s*hidden/)
  assert.match(css, /\.figma-core-screen[^}]*padding:\s*28px 32px 48px/)
})
test('route headings use the accepted Figma product language', () => {
  for (const heading of ['此刻', '每日精选', '成长', '社区', '书信', '路得 AI', '会员与积分']) {
    assert.match(layout, new RegExp(`\\['${heading}',`))
  }
})

test('home is a relationship feed rather than a legacy dashboard stack', () => {
  assert.match(page('Dashboard'), /figma-feed-post/)
  assert.match(css, /\.figma-feed-post/)
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.figma-home-utilities[^}]*order:\s*3/)
  assert.doesNotMatch(page('Dashboard'), /2 小时前|经安全审核|♡ 24|○ 8/)
  assert.match(page('Dashboard'), /平台导读/)
})

test('mobile letter workspace switches between list and active conversation', () => {
  assert.match(page('Chat'), /is-thread-open/)
  assert.match(page('Chat'), /返回书信列表/)
  assert.match(css, /\.figma-letter-workspace\.is-thread-open\s*>\s*:first-child[^}]*display:\s*none\s*!important/)
  assert.match(css, /\.figma-letter-workspace\.is-thread-open\s*>\s*:last-child[^}]*display:\s*flex\s*!important/)
  assert.doesNotMatch(page('Chat'), /[💬✉️]/u)
})

test('daily picks keeps filters secondary without truncating available candidates', () => {
  assert.match(page('Match'), /figma-match-filters/)
  assert.match(page('Match'), /figma-candidate-card/)
  assert.match(page('Match'), /candidates\.map\(/)
  assert.doesNotMatch(page('Match'), /candidates\.slice\(/)
  assert.doesNotMatch(page('Match'), /⛪/u)
  assert.match(page('Match'), /figma-candidate-card[\s\S]*figma-inline-notice/)
  assert.match(css, /\.figma-candidate-card/)
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.figma-match-filters[^}]*position:\s*absolute/)
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.figma-daily-picks\s*>\s*\.grid-2[^}]*scroll-snap-type:\s*x\s+mandatory/)
})

test('desktop shell uses the accepted Figma brand copy and carded recommendation rail', () => {
  assert.match(layout, /在真实中相遇/)
  assert.match(layout, /今日值得认识/)
  assert.match(layout, /figma-rail-card/)
  assert.match(css, /\.figma-rail-card/)
})

test('VIP API failures do not inject prototype plans', () => {
  assert.ok(
    !/\.catch\s*\(\s*\(\)\s*=>\s*setPlans\s*\(\s*\[/s.test(page('Vip')),
    'VIP failures must render an error state instead of injecting prototype plans',
  )
  assert.match(page('Vip'), /isDesktopViewport\s*\?\s*\[\]\s*:\s*legacyMobileFallbackPlans/)
  assert.match(page('Vip'), /isDesktopViewport\s*&&\s*plansLoading/)
})

test('new AI and VIP error states are scoped to desktop viewports', () => {
  assert.match(page('AiConsult'), /isDesktopViewport\s*&&\s*historyError/)
  assert.match(page('Vip'), /isDesktopViewport\s*&&\s*pointsError/)
  assert.match(css, /@media \(min-width:\s*769px\)[\s\S]*?\.ai-history-error/)
})

test('desktop community uses the shell rail instead of a nested 236px sidebar', () => {
  const community = page('Community')
  const hasNestedSidebar = /className=["']com-sidebar["']/.test(community)
  const hidesNestedSidebarOnDesktop = /@media \(min-width:\s*769px\)[\s\S]*?\.figma-app-shell \.figma-community-feed \.com-sidebar\s*\{[^}]*display:\s*none/s.test(css)

  assert.match(
    css,
    /@media \(min-width:\s*769px\)[\s\S]*?\.figma-app-shell \.figma-community-feed\.com-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'desktop community must collapse the nested sidebar column',
  )
  assert.ok(!hasNestedSidebar || hidesNestedSidebarOnDesktop, 'nested community sidebar must be absent or hidden on desktop')
})

test('community actions use the Figma SVG icon set instead of legacy emoji', () => {
  assert.doesNotMatch(page('Community'), /[\u{1F300}-\u{1FAFF}]/u)
  assert.match(page('Community'), /FigmaIcon/)
  for (const icon of ['bookmark', 'flag', 'pin', 'trash', 'bell', 'map', 'target']) {
    assert.match(ui, new RegExp(`\\b${icon}:`))
  }
  const community = page('Community')
  for (const label of ['评论', '举报', '置顶', '取消置顶', '设为精华', '删除帖子', '通知']) {
    assert.match(community, new RegExp(`aria-label=["']${label}["']`))
  }
  for (const label of ['点赞', '取消点赞', '收藏', '取消收藏']) {
    assert.match(community, new RegExp(`["']${label}["']`))
  }
})

test('profile trust badge reflects actual loading, completion, and email state', () => {
  assert.match(page('Profile'), /profileTrustState/)
  assert.match(page('Profile'), /email_verified/)
  assert.doesNotMatch(page('Profile'), /<span className="badge badge-green">基础资料已验证<\/span>/)
})

test('mobile AI keeps consultation boundaries and escalation guidance reachable', () => {
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.figma-ai-workbench \.ai-side[^}]*display:\s*block/)
})
