import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const layout = read('components/AppLayout.jsx')
const sidebar = read('components/app/AppSidebar.jsx')
const mobileHeader = read('components/app/MobileHeader.jsx')
const mobileNavigation = read('components/app/MobileNavigation.jsx')
const userMenu = read('components/app/UserMenu.jsx')
const css = read('index.css')

test('application shell uses the fixed shadcn sidebar structure and one main landmark', () => {
  assert.match(sidebar, /<Sidebar[^>]+collapsible="offcanvas"/)
  assert.doesNotMatch(sidebar, /collapsible="none"/)
  assert.doesNotMatch(layout, /<main className="app-main"/)
  assert.match(layout, /<div className="app-main"/)
})

test('desktop sidebar exposes private messages with an accessible icon action', () => {
  assert.match(sidebar, /MessageCircleIcon/)
  assert.match(sidebar, /to="\/chat" aria-label="私信"/)
  assert.match(sidebar, /<TooltipContent>私信<\/TooltipContent>/)
})

test('aggregate navigation owns aria-current and shares one icon map', () => {
  assert.doesNotMatch(sidebar, /NavLink/)
  assert.doesNotMatch(mobileNavigation, /NavLink/)
  assert.match(sidebar, /aria-current=\{isActive \? 'page' : undefined\}/)
  assert.match(mobileNavigation, /aria-current=\{isActive \? 'page' : undefined\}/)
  assert.match(sidebar, /from '\.\/section-icons'/)
  assert.match(mobileNavigation, /from '\.\/section-icons'/)
})

test('logout failures are handled without navigation or unhandled rejections', () => {
  assert.match(layout, /import \{ toast \} from 'sonner'/)
  assert.match(layout, /try \{[\s\S]*await logout\(\)[\s\S]*navigate\('\/login', \{ replace: true \}\)[\s\S]*\} catch/s)
  assert.match(layout, /toast\.error\('退出失败，请检查网络后重试'\)/)
})

test('mobile header actions meet touch size and long identities wrap in the menu', () => {
  assert.match(mobileHeader, /className="mobile-message-button"/)
  assert.match(css, /\.mobile-message-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s)
  assert.match(css, /\.mobile-header \.user-menu-trigger\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s)
  assert.match(userMenu, /className="user-menu-email"/)
  assert.match(css, /\.user-menu-email\s*\{[^}]*overflow-wrap:\s*anywhere/s)
})
