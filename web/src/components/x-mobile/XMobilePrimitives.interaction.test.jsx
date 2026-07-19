import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { XMobileDetailHeader } from './XMobileDetailHeader'
import { XMobileFormRow } from './XMobileFormRow'
import { XMobileTabs } from './XMobileTabs'
import { XMobileTopBar } from './XMobileTopBar'

afterEach(cleanup)

describe('X mobile primitives', () => {
  it('puts the account trigger on the left and one optional action on the right', async () => {
    const user = userEvent.setup()
    const onMenu = vi.fn()
    const onAction = vi.fn()

    render(
      <XMobileTopBar
        title="社区"
        avatarLabel="安"
        onMenu={onMenu}
        action={{ label: '搜索', onClick: onAction }}
      />,
    )

    const header = screen.getByRole('banner')
    const buttons = header.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].getAttribute('aria-label')).toBe('打开个人菜单')
    expect(buttons[1].getAttribute('aria-label')).toBe('搜索')

    await user.click(buttons[0])
    await user.click(buttons[1])
    expect(onMenu).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('renders page tabs with selection semantics and keyboard activation', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <XMobileTabs
        items={[
          { value: 'for-you', label: '为你推荐' },
          { value: 'following', label: '正在关注' },
        ]}
        value="for-you"
        onChange={onChange}
        ariaLabel="首页时间线"
      />,
    )

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].tabIndex).toBe(0)
    expect(tabs[1].tabIndex).toBe(-1)

    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(onChange).toHaveBeenCalledWith('following')
  })

  it('exposes reusable detail and form semantics without card wrappers', () => {
    render(
      <>
        <XMobileDetailHeader title="章节标题" subtitle="教材名称" onBack={() => {}} action={<button type="button">目录</button>} />
        <XMobileFormRow label="昵称" htmlFor="nickname" help="公开展示" error="昵称不能为空">
          <input id="nickname" />
        </XMobileFormRow>
      </>,
    )

    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '目录' })).toBeTruthy()
    expect(screen.getByLabelText('昵称')).toBeTruthy()
    expect(screen.getByText('公开展示')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('昵称不能为空')
  })
})
