import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AdminMobile from './AdminMobile'
import CommunityMobile from './CommunityMobile'
import CourseAuthoringMobile from './CourseAuthoringMobile'
import ProfileMobile from './ProfileMobile'
import UserTimelineMobile from './UserTimelineMobile'

afterEach(cleanup)

describe('high-density X mobile route views', () => {
  it('keeps community feeds, creation and line actions reachable', async () => {
    const user = userEvent.setup()
    const onLike = vi.fn()
    const changeTab = vi.fn()
    render(<MemoryRouter><CommunityMobile controller={{ view: 'global', activeTab: 'trending', posts: [{ id: 'p1', author_id: 'u1', author_nickname: '安然', content: '真实地认识彼此', liked_by_me: false }], followed: new Set(), comments: {}, openComments: new Set(), content: '', title: '', imageUrl: '', currentUser: { id: 'me' }, changeTab, toggleLike: onLike, toggleComments: () => {}, toggleBookmark: () => {}, openUser: () => {}, setContent: () => {}, setTitle: () => {}, setImageUrl: () => {}, submitPost: () => {} }} /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: '热门' })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: '热门' }))
    expect(changeTab).toHaveBeenCalledWith('hot')
    await user.click(screen.getByRole('button', { name: '点赞' }))
    expect(onLike).toHaveBeenCalledWith('p1')
  })

  it('renders a user profile timeline with follow and like actions', async () => {
    const user = userEvent.setup()
    const onFollow = vi.fn()
    render(<MemoryRouter><UserTimelineMobile profile={{ nickname: '安然', intro: '认真生活', post_count: 1, follower_count: 2, following_count: 3 }} posts={[]} followed={false} onFollow={onFollow} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '关注' }))
    expect(onFollow).toHaveBeenCalledOnce()
  })

  it('keeps announcement feeds read-only and exposes group moderation actions', () => {
    render(<MemoryRouter><CommunityMobile controller={{ view: 'group-detail', activeTab: 'announcements', selectedGroup: { id: 'g1', name: '同路人' }, groupDetail: { id: 'g1', name: '同路人' }, isMember: true, isAdmin: true, currentUser: { id: 'admin' }, posts: [{ id: 'p1', author_id: 'u1', author_nickname: '安然', content: '小组公告', state: 'published', moderation: 'pending' }], followed: new Set(), openComments: new Set(), comments: {}, commentBodies: {}, changeTab: () => {} }} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: '发布小组动态' })).toBeNull()
    expect(screen.getByRole('button', { name: '置顶' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '审核通过' })).toBeTruthy()
  })

  it('switches profile into full-screen edit sections without card wrappers', async () => {
    const user = userEvent.setup()
    const onProfileChange = vi.fn()
    render(<ProfileMobile user={{ email: 'user@example.com' }} form={{ nickname: '安然', privacy_ok: false }} faith={{}} endorsements={[]} busy={{}} onProfileChange={onProfileChange} onFaithChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: '编辑资料' }))
    expect(screen.getByLabelText('昵称')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: /匿名匹配/ }))
    expect(onProfileChange).toHaveBeenCalledWith('privacy_ok', true)
    expect(document.querySelector('.card')).toBeNull()
  })

  it('switches course authoring list into a mobile editor detail', async () => {
    const user = userEvent.setup()
    const onOpenCourse = vi.fn()
    const props = { courses: [{ id: 'c1', title: '关系课程', publication_state: 'draft' }], draft: { title: '关系课程', description: '', units: [], exam: { pass_threshold: 80, questions: [] } }, editable: true, onOpenCourse }
    const { rerender } = render(<CourseAuthoringMobile {...props} />)
    await user.click(screen.getByRole('button', { name: /关系课程/ }))
    expect(onOpenCourse).toHaveBeenCalledWith('c1')
    rerender(<CourseAuthoringMobile {...props} selectedId="c1" />)
    expect(screen.getByRole('heading', { name: '关系课程' })).toBeTruthy()
    expect(screen.getByLabelText('课程标题')).toBeTruthy()
  })

  it('exposes all seven admin sections as X tabs', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<AdminMobile activeTab="overview" onTabChange={onTabChange} />)
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    await user.click(screen.getByRole('tab', { name: '配置' }))
    expect(onTabChange).toHaveBeenCalledWith('settings')
  })
})
