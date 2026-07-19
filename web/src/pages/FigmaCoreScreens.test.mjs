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

for (const [file, marker] of Object.entries(markers)) {
  test(`${file} exposes its Figma core screen`, () => {
    assert.match(page(file), new RegExp(marker))
    assert.match(css, new RegExp(`\\.${marker}`))
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
})

test('mobile letter workspace hides the inline flex detail pane without overflow', () => {
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.figma-letter-workspace\s*>\s*:last-child[^}]*display:\s*none\s*!important/)
  assert.doesNotMatch(page('Chat'), /[💬✉️]/u)
})

test('daily picks keeps filters secondary and renders at most three Figma candidate cards', () => {
  assert.match(page('Match'), /figma-match-filters/)
  assert.match(page('Match'), /figma-candidate-card/)
  assert.match(page('Match'), /candidates\.slice\(0,\s*3\)/)
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

test('community actions use the Figma SVG icon set instead of legacy emoji', () => {
  assert.doesNotMatch(page('Community'), /[\u{1F300}-\u{1FAFF}]/u)
  assert.match(page('Community'), /FigmaIcon/)
  for (const icon of ['bookmark', 'flag', 'pin', 'trash', 'bell', 'map', 'target']) {
    assert.match(ui, new RegExp(`\\b${icon}:`))
  }
})
