import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AiConsultMobile from './AiConsultMobile'
import ChatMobile from './ChatMobile'
import CoursesMobile from './CoursesMobile'
import DashboardMobile from './DashboardMobile'
import MatchMobile from './MatchMobile'

afterEach(cleanup)

describe('core X mobile route views', () => {
  it('renders home timeline tabs and a real check-in action', async () => {
    const user = userEvent.setup()
    const onCheckin = vi.fn()
    render(<MemoryRouter><DashboardMobile points={{ earned: 120, daily: 10 }} qualification={{ inPool: false }} gateSteps={[]} gateDone={0} gatePct={0} onCheckin={onCheckin} onRetry={() => {}} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: '为你推荐' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '签到 +10' }))
    expect(onCheckin).toHaveBeenCalledOnce()
  })

  it('renders every match candidate as a flat timeline row with line actions', async () => {
    const user = userEvent.setup()
    const onExpress = vi.fn()
    const candidates = [{ id: '1', nickname: '安然', city: '上海' }, { id: '2', nickname: '晨光', city: '杭州' }]
    render(<MemoryRouter><MatchMobile candidates={candidates} filters={{ min_age: '', max_age: '', city: '' }} onFiltersChange={() => {}} onApplyFilters={() => {}} onClearFilters={() => {}} onExpress={onExpress} /></MemoryRouter>)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: '表达心动' })[0])
    expect(onExpress).toHaveBeenCalledWith('1', 'like')
  })

  it('switches growth from course list to a separate detail view', async () => {
    const user = userEvent.setup()
    const courses = [{ slug: 'course', title: '婚姻的意义', description: '关系装备' }]
    const progress = { course: { units: [{ id: 'unit', unit_index: 1, title: '盟约', material: '课程正文', readings: [] }], attempts: [], progress: { units_done: 0 } } }
    render(<MemoryRouter><CoursesMobile courses={courses} progress={progress} submitting={{}} examState={{}} onRetry={() => {}} onMarkRead={() => {}} onLoadExam={() => {}} onSetExamAnswer={() => {}} onSubmitExam={() => {}} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /婚姻的意义/ }))
    expect(screen.getByRole('heading', { name: '婚姻的意义' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /盟约/ })).toBeTruthy()
  })

  it('uses links for chat list and sends from an independent thread view', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const channel = { id: 'c1', other_nickname: '安然', last_msg: '你好' }
    const { rerender } = render(<MemoryRouter><ChatMobile channels={[channel]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /安然/ }).getAttribute('href')).toBe('/chat/c1')
    rerender(<MemoryRouter><ChatMobile active={channel} messages={[]} text="平安" onTextChange={() => {}} onSend={onSend} onBack={() => {}} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('formats chat timestamps instead of exposing raw ISO values', () => {
    const timestamp = '2026-07-19T19:00:18.030Z'
    const channel = { id: 'c1', other_nickname: '安然', last_msg: '你好', last_at: timestamp }
    const { rerender } = render(<MemoryRouter><ChatMobile channels={[channel]} /></MemoryRouter>)
    expect(screen.queryByText(timestamp)).toBeNull()
    rerender(<MemoryRouter><ChatMobile user={{ id: 'u1' }} active={channel} messages={[{ id: 'm1', sender_id: 'u1', body: '平安', created_at: timestamp }]} onTextChange={() => {}} onSend={() => {}} onBack={() => {}} /></MemoryRouter>)
    expect(screen.queryByText(timestamp)).toBeNull()
  })

  it('keeps AI boundaries, history, sources and human escalation in the mobile flow', () => {
    render(<AiConsultMobile question="" history={[]} boundaries={['不替代医疗建议']} escalation={['紧急情况请联系真人']} prompts={[]} onQuestionChange={() => {}} onAsk={() => {}} />)
    expect(screen.getByText('咨询边界')).toBeTruthy()
    expect(screen.getByText('最近咨询')).toBeTruthy()
    expect(screen.getByText('需要真人介入时')).toBeTruthy()
  })
})
