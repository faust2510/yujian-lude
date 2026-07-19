import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import FaithTestMobile from './FaithTestMobile'
import PastorMobile from './PastorMobile'
import RelationshipsMobile from './RelationshipsMobile'
import TextbookReaderMobile from './TextbookReaderMobile'
import TextbooksMobile from './TextbooksMobile'
import VipMobile from './VipMobile'

afterEach(cleanup)

describe('low-coupling X mobile route views', () => {
  it('renders textbook list and detail as flat navigable rows', () => {
    render(<MemoryRouter><TextbooksMobile list={[{ slug: 'book', title: '婚姻的意义', author: '提摩太·凯勒', chapter_count: 2, completed_count: 1 }]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /婚姻的意义/ })).toBeTruthy()
    expect(document.querySelector('.x-mobile-list')).toBeTruthy()
  })

  it('keeps reader progress action and chapter navigation reachable', async () => {
    const user = userEvent.setup()
    const markRead = vi.fn()
    render(<MemoryRouter><TextbookReaderMobile data={{ textbook: { title: '婚姻的意义' }, chapter: { title: '盟约', body_html: '<p>正文</p>', completed: false } }} onBack={() => {}} onMarkRead={markRead} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '标记本章已读' }))
    expect(markRead).toHaveBeenCalledOnce()
    expect(screen.getByText('正文')).toBeTruthy()
  })

  it('renders faith questions as uncarded form rows and submits only when complete', () => {
    const questions = [{ id: 1, q: '问题', options: { A: '答案甲', B: '答案乙' } }]
    render(<FaithTestMobile status={{ attempted: false }} questions={questions} answers={{ 1: 0 }} total={1} answered={1} onAnswer={() => {}} onSubmit={() => {}} />)
    expect(screen.getByRole('radio', { name: /A\. 答案甲/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: '提交测试（1/1）' }).disabled).toBe(false)
  })

  it('renders relationships, membership, and pastor forms with X list/form primitives', () => {
    const { rerender } = render(<MemoryRouter><RelationshipsMobile data={{ relationship: null }} channels={[]} user={{ role: 'user' }} /></MemoryRouter>)
    expect(screen.getByText('还没有进行中的关系')).toBeTruthy()

    rerender(<MemoryRouter><VipMobile plans={[]} earned={300} days={1} onDaysChange={() => {}} onRedeem={() => {}} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '兑换 1 天 VIP' })).toBeTruthy()

    rerender(<MemoryRouter><PastorMobile form={{ church_name: '', presbytery: '', ordination_info: '', contact: '', statement: '' }} onFieldChange={() => {}} onSubmit={() => {}} /></MemoryRouter>)
    expect(screen.getByLabelText('所牧养的教会 / 堂会')).toBeTruthy()
    expect(screen.getByRole('button', { name: '提交认证申请' })).toBeTruthy()
  })
})
