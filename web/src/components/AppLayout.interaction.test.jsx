import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'

let authState = {
  user: { email: 'user@example.com', name: '平安', role: 'user' },
  logout: vi.fn(),
}

const { profileApi } = vi.hoisted(() => ({
  profileApi: { get: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../api/client', () => ({
  profile: profileApi,
}))

profileApi.get.mockResolvedValue({ data: { profile: { nickname: '平安', completion: 80 } } })

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
  profileApi.get.mockReset()
  profileApi.get.mockResolvedValue({ data: { profile: { nickname: '平安', completion: 80 } } })
  authState = {
    user: { email: 'user@example.com', name: '平安', role: 'user' },
    logout: vi.fn(),
  }
})

describe('AppLayout interactions', () => {
  it('renders the server profile completion and route-aware desktop rail', async () => {
    profileApi.get.mockResolvedValue({ data: { profile: { nickname: '路得', completion: 72 } } })
    renderLayout('/profile')

    expect(await screen.findByRole('link', { name: '资料完整度 72%' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '资料与信任' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /只填写真实资料/ })).toBeTruthy()
  })

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
