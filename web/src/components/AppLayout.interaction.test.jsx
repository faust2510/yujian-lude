import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'

let authState = {
  user: { email: 'user@example.com', name: '平安', role: 'user' },
  logout: vi.fn(),
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<div>首页内容</div>} />
          <Route path="profile" element={<div>资料内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  authState = {
    user: { email: 'user@example.com', name: '平安', role: 'user' },
    logout: vi.fn(),
  }
})

describe('AppLayout interactions', () => {
  it('closes the mobile menu after navigating to a secondary route', async () => {
    const user = userEvent.setup()
    renderLayout()

    const menuToggle = screen.getByLabelText('打开更多功能')
    const menu = menuToggle.closest('details')
    await user.click(menuToggle)
    expect(menu?.hasAttribute('open')).toBe(true)

    await user.click(screen.getAllByRole('link', { name: '完善资料' })[1])

    expect(screen.getByText('资料内容')).toBeTruthy()
    expect(menu?.hasAttribute('open')).toBe(false)
  })

  it('shows role-restricted navigation only to allowed users', () => {
    const { unmount } = renderLayout()
    expect(screen.queryByRole('link', { name: '管理台' })).toBeNull()
    expect(screen.queryByRole('link', { name: '课程工作台' })).toBeNull()
    unmount()

    authState = {
      user: { email: 'admin@example.com', name: '管理员', role: 'admin' },
      logout: vi.fn(),
    }
    renderLayout()

    expect(screen.getAllByRole('link', { name: '管理台' }).length).toBe(2)
    expect(screen.getAllByRole('link', { name: '课程工作台' }).length).toBe(2)
  })
})
