import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import XMobileShell from './XMobileShell'
import { filterSecondaryNav, primaryNav, secondaryNav } from '../../navigation/appNavigation'

function renderShell(path = '/', role = 'user') {
  const logout = vi.fn()
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<XMobileShell user={{ name: '平安', email: 'user@example.com', role }} logout={logout} />}>
          <Route index element={<div>首页内容</div>} />
          <Route path="pastor" element={<div>牧者内容</div>} />
          <Route path="profile" element={<div>资料内容</div>} />
          <Route path="*" element={<div>页面内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return { logout }
}

afterEach(cleanup)

describe('XMobileShell interactions', () => {
  it('provides five primary destinations and filters secondary items by role', () => {
    expect(primaryNav.map((item) => item.to)).toEqual(['/', '/match', '/courses', '/community', '/chat'])
    expect(secondaryNav.some((item) => item.to === '/pastor')).toBe(true)
    expect(filterSecondaryNav('user').map((item) => item.to)).toContain('/pastor')
    expect(filterSecondaryNav('user').map((item) => item.to)).not.toContain('/course-authoring')
    expect(filterSecondaryNav('pastor').map((item) => item.to)).toContain('/course-authoring')
    expect(filterSecondaryNav('admin').map((item) => item.to)).toContain('/admin')
  })

  it('opens drawer, closes it on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    renderShell()
    const trigger = screen.getByRole('button', { name: '打开个人菜单' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '个人菜单' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '个人菜单' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('traps Tab and Shift+Tab inside the drawer', async () => {
    const user = userEvent.setup()
    renderShell('/', 'pastor')
    await user.click(screen.getByRole('button', { name: '打开个人菜单' }))
    const close = screen.getByRole('button', { name: '关闭个人菜单' })
    const logout = screen.getByRole('button', { name: '退出登录' })
    expect(document.activeElement).toBe(close)
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement).toBe(logout)
    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(close)
  })

  it('exposes five touch-friendly labelled primary navigation links', () => {
    renderShell()
    const navigation = screen.getByRole('navigation', { name: '主要导航' })
    const links = navigation.querySelectorAll('a')
    expect(links).toHaveLength(5)
    expect(links[0].className).toContain('x-mobile-touch-target')
    expect(links[4].textContent).toContain('书信')
  })
})
