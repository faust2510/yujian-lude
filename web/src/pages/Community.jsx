import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { community } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`
  if (s < 2592000) return `${Math.floor(s / 86400)}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function Avatar({ name, size = 40, onClick }) {
  return (
    <div className="com-avatar" style={{ width: size, height: size, fontSize: size * 0.38, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      {name?.[0] ?? '?'}
    </div>
  )
}

const NOTIF_LABELS = {
  like: '赞了你的帖子',
  comment: '评论了你的帖子',
  reply: '回复了你的评论',
  follow: '关注了你',
  group_join: '申请加入小组',
  post_approved: '帖子已通过审核',
  post_featured: '帖子被设为精华',
  event_new: '新活动发布',
  report_resolved: '举报已处理',
}

const CATEGORY_TABS = [
  { key: '', label: '全部' },
  { key: 'region', label: '地区' },
  { key: 'interest', label: '兴趣' },
]

const GROUP_TAB_LABELS = { posts: '帖子', members: '成员', events: '活动', announcements: '公告' }

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || fallback
}

export default function Community() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const user = currentUser ?? {}

  // ─── view state ───
  const [view, setView] = useState('global') // 'global' | 'groups' | 'group-detail'
  const [activeTab, setActiveTab] = useState('trending') // for global: following/hot/trending; for group-detail: posts/members/events/announcements

  // ─── groups ───
  const [groups, setGroups] = useState([])
  const [groupCategory, setGroupCategory] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupDetail, setGroupDetail] = useState(null)

  // ─── group members/pending ───
  const [members, setMembers] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])

  // ─── group events ───
  const [events, setEvents] = useState([])

  // ─── create group modal ───
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroup, setNewGroup] = useState({ name: '', description: '', category: 'interest', join_policy: 'apply' })
  const [creatingGroup, setCreatingGroup] = useState(false)

  // ─── create event modal ───
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', description: '', location: '', starts_at: '', ends_at: '', max_attendees: '' })

  // ─── posts ───
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ─── composer ───
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [posting, setPosting] = useState(false)

  // ─── comments ───
  const [openComments, setOpenComments] = useState(new Set())
  const [comments, setComments] = useState({})
  const [commentBodies, setCommentBodies] = useState({})
  const [replyTo, setReplyTo] = useState(null)

  // ─── notifications ───
  const [notifCount, setNotifCount] = useState(0)
  const [notifList, setNotifList] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const notifRef = useRef(null)

  // ─── follow / suggested ───
  const [followed, setFollowed] = useState(new Set())
  const [suggestedUsers, setSuggestedUsers] = useState([])

  // ─── search ───
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState(null)

  // ─── bookmarks ───
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState([])

  // ─── report modal ───
  const [showReport, setShowReport] = useState(null) // { target_type, target_id }
  const [reportReason, setReportReason] = useState('spam')
  const [reportDetail, setReportDetail] = useState('')

  // ═══════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  const loadGroups = useCallback(async (cat = '', q = '') => {
    setLoadingGroups(true)
    try {
      const params = {}
      if (cat) params.category = cat
      if (q) params.q = q
      const res = await community.groups(params)
      setGroups(res.data.groups ?? [])
    } catch (e) {
      setError(getErrorMessage(e, '小组加载失败'))
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  const loadPosts = useCallback(async (p = 1, opts = {}) => {
    setLoading(true)
    setError('')
    try {
      let res
      if (opts.groupId) {
        res = await community.posts({ page: p, group_id: opts.groupId, post_type: opts.postType })
      } else if (opts.tab === 'following') {
        res = await community.feedFollowing(p)
      } else if (opts.tab === 'hot') {
        res = await community.feedHot(p)
      } else if (opts.tab === 'trending') {
        res = await community.feedTrending(p)
      } else if (opts.tag) {
        res = await community.posts({ page: p, tag: opts.tag })
      } else {
        res = await community.posts({ page: p })
      }
      const newPosts = res.data.posts ?? []
      setPosts(prev => p === 1 ? newPosts : [...prev, ...newPosts])
      setPage(p)
      setHasMore(newPosts.length >= 20)
    } catch (e) {
      setError(e.response?.data?.error || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGroupDetail = async (groupId) => {
    try {
      const res = await community.groupDetail(groupId)
      setGroupDetail(res.data.group)
    } catch (e) {
      setError(getErrorMessage(e, '小组详情加载失败'))
    }
  }

  const loadMembers = async (groupId) => {
    try {
      const res = await community.groupMembers(groupId)
      setMembers(res.data.members ?? [])
    } catch (e) {
      setError(getErrorMessage(e, '成员加载失败'))
    }
  }

  const loadPending = async (groupId) => {
    try {
      const res = await community.groupPending(groupId)
      setPendingRequests(res.data.pending ?? [])
    } catch (e) {
      setError(getErrorMessage(e, '待审核申请加载失败'))
    }
  }

  const loadEvents = async (groupId) => {
    try {
      const res = await community.groupEvents(groupId)
      setEvents(res.data.events ?? [])
    } catch (e) {
      setError(getErrorMessage(e, '活动加载失败'))
    }
  }

  // ─── initial load ───
  useEffect(() => {
    community.unreadCount().then(r => setNotifCount(r.data.unread)).catch(() => setNotifCount(0))
    community.following().then(r => {
      setFollowed(new Set((r.data.following ?? []).map(f => f.user_id)))
    }).catch(() => setFollowed(new Set()))
    community.suggestedUsers().then(r => {
      setSuggestedUsers(r.data.users ?? [])
    }).catch(() => setSuggestedUsers([]))
    loadPosts(1, { tab: 'trending' })
  }, [loadPosts])

  useEffect(() => {
    if (showNotifs) {
      community.notifications(1).then(r => setNotifList(r.data.notifications ?? [])).catch(() => setNotifList([]))
    }
  }, [showNotifs])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false)
    }
    if (showNotifs) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifs])

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  const goToGlobal = () => {
    setView('global')
    setActiveTab('trending')
    setActiveTag(null)
    setSearchQuery('')
    setSelectedGroup(null)
    setGroupDetail(null)
    loadPosts(1, { tab: 'trending' })
  }

  const goToGroups = () => {
    setView('groups')
    setSelectedGroup(null)
    setGroupDetail(null)
    setGroupCategory('')
    setGroupSearch('')
    loadGroups()
  }

  const goToGroup = (group) => {
    setSelectedGroup(group)
    setGroupDetail(null)
    setView('group-detail')
    setActiveTab('posts')
    setPosts([])
    loadGroupDetail(group.id)
    loadPosts(1, { groupId: group.id })
    loadMembers(group.id)
    loadEvents(group.id)
    if (group.my_role === 'owner' || group.my_role === 'admin') {
      loadPending(group.id)
    }
  }

  const switchGlobalTab = (tab) => {
    setActiveTab(tab)
    setActiveTag(null)
    setSearchQuery('')
    loadPosts(1, { tab })
  }

  const switchGroupTab = (tab) => {
    setActiveTab(tab)
    if (tab === 'posts') loadPosts(1, { groupId: selectedGroup.id })
    else if (tab === 'members') loadMembers(selectedGroup.id)
    else if (tab === 'events') loadEvents(selectedGroup.id)
    else if (tab === 'announcements') loadPosts(1, { groupId: selectedGroup.id, postType: 'announcement' })
  }

  // ═══════════════════════════════════════════════════════════════
  // GROUP ACTIONS
  // ═══════════════════════════════════════════════════════════════

  const createGroup = async () => {
    if (!newGroup.name.trim()) return
    setCreatingGroup(true)
    try {
      await community.createGroup(newGroup)
      setShowCreateGroup(false)
      setNewGroup({ name: '', description: '', category: 'interest', join_policy: 'apply' })
      loadGroups(groupCategory, groupSearch)
    } catch (e) {
      setError(e.response?.data?.error || '创建失败')
    } finally {
      setCreatingGroup(false)
    }
  }

  const joinGroup = async (groupId) => {
    try {
      await community.joinGroup(groupId)
      if (selectedGroup?.id === groupId) {
        loadGroupDetail(groupId)
      }
      loadGroups(groupCategory, groupSearch)
    } catch (e) {
      setError(e.response?.data?.error || '加入失败')
    }
  }

  const moderateMember = async (userId, action) => {
    try {
      await community.moderateMember(selectedGroup.id, userId, action)
      loadMembers(selectedGroup.id)
      loadPending(selectedGroup.id)
      loadGroupDetail(selectedGroup.id)
    } catch (e) {
      setError(e.response?.data?.error || '操作失败')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // POST ACTIONS
  // ═══════════════════════════════════════════════════════════════

  const submitPost = async () => {
    if (!content.trim()) return
    setPosting(true)
    setError('')
    try {
      const payload = { content: content.trim() }
      if (title.trim()) payload.title = title.trim()
      if (imageUrl.trim()) payload.image_url = imageUrl.trim()
      if (selectedGroup) payload.group_id = selectedGroup.id
      await community.post(payload)
      setContent('')
      setTitle('')
      setImageUrl('')
      if (selectedGroup) {
        loadPosts(1, { groupId: selectedGroup.id })
      } else {
        loadPosts(1, { tab: activeTab })
      }
    } catch (e) {
      setError(e.response?.data?.error || '发帖失败')
    } finally {
      setPosting(false)
    }
  }

  const deletePost = async (id) => {
    try {
      await community.deletePost(id)
      setPosts(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      setError(getErrorMessage(e, '删除帖子失败'))
    }
  }

  const toggleLike = async (postId) => {
    try {
      const res = await community.like(postId)
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, liked_by_me: res.data.liked, like_count: p.like_count + (res.data.liked ? 1 : -1) }
          : p
      ))
    } catch (e) {
      setError(getErrorMessage(e, '点赞失败'))
    }
  }

  const toggleBookmark = async (postId) => {
    try {
      const res = await community.bookmark(postId)
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, bookmarked_by_me: res.data.bookmarked } : p
      ))
    } catch (e) {
      setError(getErrorMessage(e, '收藏失败'))
    }
  }

  const moderatePost = async (postId, action) => {
    try {
      await community.moderate(postId, action)
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch (e) {
      setError(getErrorMessage(e, '审核失败'))
    }
  }

  const featurePost = async (postId, action) => {
    try {
      await community.feature(postId, action)
      if (selectedGroup) loadPosts(1, { groupId: selectedGroup.id })
    } catch (e) {
      setError(getErrorMessage(e, '操作失败'))
    }
  }

  const submitReport = async () => {
    if (!showReport) return
    try {
      await community.report({ ...showReport, reason: reportReason, detail: reportDetail })
      setShowReport(null)
      setReportReason('spam')
      setReportDetail('')
    } catch (e) {
      setError(getErrorMessage(e, '举报失败'))
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMENT ACTIONS
  // ═══════════════════════════════════════════════════════════════

  const toggleComments = async (postId) => {
    const next = new Set(openComments)
    if (next.has(postId)) {
      next.delete(postId)
    } else {
      next.add(postId)
      if (!comments[postId]) {
        try {
          const res = await community.getComments(postId)
          setComments(prev => ({ ...prev, [postId]: res.data.comments ?? [] }))
        } catch (e) {
          setComments(prev => ({ ...prev, [postId]: [] }))
          setError(getErrorMessage(e, '评论加载失败'))
        }
      }
    }
    setOpenComments(next)
    setReplyTo(null)
  }

  const submitComment = async (postId) => {
    const body = commentBodies[postId]
    if (!body?.trim()) return
    try {
      const data = { body: body.trim() }
      if (replyTo?.postId === postId) data.parent_id = replyTo.commentId
      await community.addComment(postId, data)
      setCommentBodies(prev => ({ ...prev, [postId]: '' }))
      setReplyTo(null)
      const res = await community.getComments(postId)
      setComments(prev => ({ ...prev, [postId]: res.data.comments ?? [] }))
    } catch (e) {
      setError(getErrorMessage(e, '评论失败'))
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FOLLOW / BOOKMARKS / SEARCH
  // ═══════════════════════════════════════════════════════════════

  const toggleFollow = async (authorId) => {
    try {
      const res = await community.follow(authorId)
      setFollowed(prev => {
        const next = new Set(prev)
        if (res.data.following) next.add(authorId)
        else next.delete(authorId)
        return next
      })
    } catch (e) {
      setError(getErrorMessage(e, '关注失败'))
    }
  }

  const loadBookmarks = async () => {
    try {
      const res = await community.bookmarks(1)
      setBookmarks(res.data.posts ?? [])
      setShowBookmarks(true)
    } catch (e) {
      setBookmarks([])
      setError(getErrorMessage(e, '收藏加载失败'))
    }
  }

  const doSearch = async () => {
    if (!searchQuery.trim()) return
    setActiveTag(null)
    try {
      const res = await community.search({ q: searchQuery.trim(), page: 1 })
      setPosts(res.data.posts ?? [])
      setPage(1)
      setHasMore(false)
    } catch (e) {
      setError(getErrorMessage(e, '搜索失败'))
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT ACTIONS
  // ═══════════════════════════════════════════════════════════════

  const createEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.starts_at) return
    try {
      await community.createEvent(selectedGroup.id, newEvent)
      setShowCreateEvent(false)
      setNewEvent({ title: '', description: '', location: '', starts_at: '', ends_at: '', max_attendees: '' })
      loadEvents(selectedGroup.id)
    } catch (e) {
      setError(e.response?.data?.error || '创建活动失败')
    }
  }

  const rsvpEvent = async (eventId, status) => {
    try {
      await community.rsvpEvent(eventId, status)
      loadEvents(selectedGroup.id)
    } catch (e) {
      setError(getErrorMessage(e, '报名失败'))
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  const openUser = (authorId) => {
    if (authorId !== user.id) navigate(`/community/user/${authorId}`)
  }

  const renderContent = (text) => {
    if (!text) return null
    const parts = text.split(/(#[\u4e00-\u9fff\w-]+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
        const tag = part.slice(1)
        return (
          <span key={i} className="com-hashtag" onClick={() => { setActiveTag(tag); setView('global'); loadPosts(1, { tag }) }}
            style={{ color: 'var(--brand)', cursor: 'pointer', fontWeight: 500 }}>
            {part}
          </span>
        )
      }
      return part
    })
  }

  const currentGroup = groupDetail ?? selectedGroup
  const isAdmin = currentGroup && (currentGroup.my_role === 'owner' || currentGroup.my_role === 'admin')
  const isMember = currentGroup && currentGroup.my_membership_state === 'approved'

  const renderErrorBanner = () => error ? (
    <div className="com-error" style={{ margin: '0 0 12px 0' }}>{error}</div>
  ) : null

  // ═══════════════════════════════════════════════════════════════
  // RENDER: GROUPS LIST
  // ═══════════════════════════════════════════════════════════════

  const renderGroupsView = () => (
    <div className="com-groups-view">
      <div className="com-groups-header">
        <h2 className="com-groups-title">小组</h2>
        <button className="btn btn-primary" onClick={() => setShowCreateGroup(true)} style={{ padding: '6px 16px', fontSize: 13 }}>
          + 创建小组
        </button>
      </div>

      <div className="com-groups-tabs">
        {CATEGORY_TABS.map(t => (
          <button key={t.key} className={`com-tab ${groupCategory === t.key ? 'active' : ''}`}
            onClick={() => { setGroupCategory(t.key); loadGroups(t.key, groupSearch) }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadGroups(groupCategory, groupSearch) }}
          placeholder="搜索小组…" className="com-search-input" style={{ maxWidth: 200 }} />
      </div>

      {loadingGroups && <div className="com-empty">加载中…</div>}
      {!loadingGroups && groups.length === 0 && <div className="com-empty">暂无小组</div>}

      <div className="com-groups-grid">
        {groups.map(g => (
          <div key={g.id} className="com-group-card" onClick={() => goToGroup(g)}>
            <div className="com-group-card-cover" style={{ backgroundImage: g.cover_image ? `url(${g.cover_image})` : 'none' }}>
              {!g.cover_image && <div className="com-group-card-placeholder">{g.name?.[0]}</div>}
            </div>
            <div className="com-group-card-body">
              <div className="com-group-card-name">{g.name}</div>
              <div className="com-group-card-desc">{g.description || '暂无简介'}</div>
              <div className="com-group-card-meta">
                <span>{g.member_count ?? 0} 成员</span>
                <span className="com-group-card-category">
                  {g.category === 'region' ? '地区' : g.category === 'interest' ? '兴趣' : g.category}
                </span>
              </div>
              {g.my_membership_state === 'approved' && <span className="com-group-card-badge">已加入</span>}
              {g.my_membership_state === 'pending' && <span className="com-group-card-badge pending">待审核</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // RENDER: GROUP DETAIL
  // ═══════════════════════════════════════════════════════════════

  const renderGroupDetail = () => {
    if (!groupDetail) return <div className="com-empty">加载中…</div>
    const g = groupDetail
    return (
      <div className="com-group-detail">
        <div className="com-group-detail-header">
          <div className="com-group-detail-cover" style={{ backgroundImage: g.cover_image ? `url(${g.cover_image})` : 'none' }}>
            {!g.cover_image && <div className="com-group-detail-placeholder">{g.name?.[0]}</div>}
          </div>
          <div className="com-group-detail-info">
            <h2 className="com-group-detail-name">{g.name}</h2>
            <p className="com-group-detail-desc">{g.description || '暂无简介'}</p>
            <div className="com-group-detail-meta">
              <span>{g.member_count ?? 0} 成员</span>
              <span>·</span>
              <span>{g.category === 'region' ? '地区' : g.category === 'interest' ? '兴趣' : g.category}</span>
              <span>·</span>
              <span>{g.join_policy === 'apply' ? '申请加入' : '开放加入'}</span>
              {g.owner_nickname && <><span>·</span><span>组长：{g.owner_nickname}</span></>}
            </div>
            {g.my_membership_state !== 'approved' && (
              <button className="btn btn-primary" onClick={() => joinGroup(g.id)}
                style={{ padding: '6px 20px', fontSize: 13, marginTop: 8 }}>
                {g.my_membership_state === 'pending' ? '已申请' : g.join_policy === 'apply' ? '申请加入' : '加入'}
              </button>
            )}
          </div>
        </div>

        <div className="com-group-tabs">
          {Object.entries(GROUP_TAB_LABELS).map(([key, label]) => (
            <button key={key} className={`com-tab ${activeTab === key ? 'active' : ''}`}
              onClick={() => switchGroupTab(key)}>
              {label}
              {key === 'pending' && pendingRequests.length > 0 && (
                <span className="com-tab-badge">{pendingRequests.length}</span>
              )}
            </button>
          ))}
          {isAdmin && (
            <button className={`com-tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => { setActiveTab('pending'); loadPending(selectedGroup.id) }}>
              待审核
              {pendingRequests.length > 0 && <span className="com-tab-badge">{pendingRequests.length}</span>}
            </button>
          )}
        </div>

        {/* Posts tab */}
        {activeTab === 'posts' && (
          <>
            {isMember && renderComposer()}
            {renderPostList()}
          </>
        )}

        {/* Announcements tab */}
        {activeTab === 'announcements' && renderPostList()}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="com-members-list">
            {members.map(m => (
              <div key={m.user_id} className="com-member-row">
                <div className="com-member-info" onClick={() => openUser(m.user_id)} style={{ cursor: 'pointer' }}>
                  <Avatar name={m.nickname} size={36} />
                  <div>
                    <div className="com-member-name">{m.nickname}</div>
                    <div className="com-member-role">
                      {m.role === 'owner' ? '组长' : m.role === 'admin' ? '管理员' : '成员'}
                    </div>
                  </div>
                </div>
                {isAdmin && m.role !== 'owner' && m.user_id !== user.id && (
                  <div className="com-member-actions">
                    {m.role === 'member' && (
                      <button className="com-action-btn" onClick={() => moderateMember(m.user_id, 'promote')}>设为管理</button>
                    )}
                    <button className="com-action-btn" style={{ color: 'var(--danger)' }}
                      onClick={() => moderateMember(m.user_id, 'kick')}>踢出</button>
                  </div>
                )}
              </div>
            ))}
            {members.length === 0 && <div className="com-empty">暂无成员</div>}
          </div>
        )}

        {/* Pending tab */}
        {activeTab === 'pending' && (
          <div className="com-members-list">
            {pendingRequests.map(m => (
              <div key={m.user_id} className="com-member-row">
                <div className="com-member-info">
                  <Avatar name={m.nickname} size={36} />
                  <div>
                    <div className="com-member-name">{m.nickname}</div>
                    <div className="com-member-role">申请于 {timeAgo(m.joined_at)}</div>
                  </div>
                </div>
                <div className="com-member-actions">
                  <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => moderateMember(m.user_id, 'approve')}>通过</button>
                  <button className="com-action-btn" style={{ color: 'var(--danger)' }}
                    onClick={() => moderateMember(m.user_id, 'reject')}>拒绝</button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && <div className="com-empty">暂无待审核申请</div>}
          </div>
        )}

        {/* Events tab */}
        {activeTab === 'events' && (
          <div className="com-events-list">
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreateEvent(true)}
                style={{ padding: '6px 16px', fontSize: 13, marginBottom: 16 }}>
                + 创建活动
              </button>
            )}
            {events.map(ev => (
              <div key={ev.id} className="com-event-card">
                <div className="com-event-header">
                  <h3 className="com-event-title">{ev.title}</h3>
                  <span className="com-event-time">{new Date(ev.starts_at).toLocaleString('zh-CN')}</span>
                </div>
                {ev.description && <p className="com-event-desc">{ev.description}</p>}
                <div className="com-event-meta">
                  {ev.location && <span>📍 {ev.location}</span>}
                  <span>{ev.attendee_count ?? 0} 人报名</span>
                  {ev.max_attendees && <span> / 上限 {ev.max_attendees}</span>}
                </div>
                <div className="com-event-actions">
                  {ev.my_rsvp === 'going' ? (
                    <button className="com-action-btn" style={{ color: 'var(--success)' }}
                      onClick={() => rsvpEvent(ev.id, 'cancelled')}>已报名 ✓</button>
                  ) : (
                    <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => rsvpEvent(ev.id, 'going')}>报名</button>
                  )}
                </div>
              </div>
            ))}
            {events.length === 0 && <div className="com-empty">暂无活动</div>}
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: COMPOSER
  // ═══════════════════════════════════════════════════════════════

  const renderComposer = () => (
    <div className="com-composer">
      {selectedGroup && (
        <div className="com-composer-row">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="标题（可选）" className="com-composer-title-input" />
        </div>
      )}
      <div className="com-composer-row">
        <Avatar name={user.nickname} size={36} />
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder={selectedGroup ? `在「${selectedGroup.name}」发帖…` : '分享你的想法…'}
          rows={2} className="com-composer-input" />
      </div>
      <div className="com-composer-image-row">
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
          placeholder="图片链接（可选）…" className="com-image-input" />
        {imageUrl && (
          <div className="com-image-preview">
            <img src={imageUrl} alt="" onError={e => { e.target.style.display = 'none' }} />
            <span className="com-image-remove" onClick={() => setImageUrl('')}>✕</span>
          </div>
        )}
      </div>
      <div className="com-composer-footer">
        {error && <span className="com-error">{error}</span>}
        {selectedGroup && isMember && <span className="com-composer-hint">帖子将由组长审核后可见</span>}
        <span className="com-char-count">{content.length}/500</span>
        <button className="btn btn-primary" onClick={submitPost}
          disabled={posting || !content.trim()} style={{ padding: '5px 16px', fontSize: 13 }}>
          {posting ? '发送中…' : '发布'}
        </button>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // RENDER: POST LIST
  // ═══════════════════════════════════════════════════════════════

  const renderPostList = () => (
    <div className="com-feed">
      {!loading && posts.length === 0 && <div className="com-empty">暂无帖子</div>}
      {posts.map(post => (
        <div key={post.id} className={`com-post ${post.post_type === 'announcement' ? 'com-post-announcement' : ''}`}>
          <div className="com-post-main">
            <Avatar name={post.author_nickname} onClick={() => openUser(post.author_id)} />
            <div className="com-post-body">
              <div className="com-post-header">
                <span className="com-post-author" onClick={() => openUser(post.author_id)} style={{ cursor: 'pointer' }}>
                  {post.author_nickname}
                </span>
                {post.author_id !== user.id && (
                  <span className={`com-follow-btn ${followed.has(post.author_id) ? 'following' : ''}`}
                    onClick={() => toggleFollow(post.author_id)}>
                    {followed.has(post.author_id) ? '已关注' : '关注'}
                  </span>
                )}
                <span className="com-post-time">{timeAgo(post.created_at)}</span>
                {post.post_type === 'announcement' && <span className="com-post-badge">公告</span>}
                {post.post_type === 'event' && <span className="com-post-badge event">活动</span>}
                {post.state === 'pinned' && <span className="com-post-badge pinned">置顶</span>}
                {post.state === 'featured' && <span className="com-post-badge featured">精华</span>}
              </div>
              {post.title && <div className="com-post-title">{post.title}</div>}
              <div className="com-post-content">
                {renderContent(post.content)}
              </div>
              {post.image_url && (
                <div className="com-post-image" style={{ marginTop: 8 }}>
                  <img src={post.image_url} alt="" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none' }} />
                </div>
              )}
              <div className="com-post-actions">
                <button className={`com-action-btn ${post.liked_by_me ? 'liked' : ''}`}
                  onClick={() => toggleLike(post.id)}>
                  {post.liked_by_me ? '❤️' : '🤍'} {post.like_count > 0 && post.like_count}
                </button>
                <button className="com-action-btn" onClick={() => toggleComments(post.id)}>
                  💬 {post.comment_count > 0 && post.comment_count}
                </button>
                <button className={`com-action-btn ${post.bookmarked_by_me ? 'bookmarked' : ''}`}
                  onClick={() => toggleBookmark(post.id)}>
                  {post.bookmarked_by_me ? '⭐' : '☆'}
                </button>
                {post.author_id !== user.id && (
                  <button className="com-action-btn" onClick={() => setShowReport({ target_type: 'post', target_id: post.id })}>
                    🚩
                  </button>
                )}
                {(user.id === post.author_id || isAdmin) && (
                  <>
                    {isAdmin && post.state !== 'pinned' && (
                      <button className="com-action-btn" onClick={() => featurePost(post.id, 'pin')}>📌</button>
                    )}
                    {isAdmin && post.state === 'pinned' && (
                      <button className="com-action-btn" onClick={() => featurePost(post.id, 'unpin')}>📌</button>
                    )}
                    {isAdmin && post.state !== 'featured' && (
                      <button className="com-action-btn" onClick={() => featurePost(post.id, 'feature')}>⭐</button>
                    )}
                    <button className="com-action-btn" onClick={() => deletePost(post.id)} style={{ color: 'var(--muted)' }}>
                      🗑️
                    </button>
                  </>
                )}
                {isAdmin && post.moderation === 'pending' && (
                  <>
                    <button className="com-action-btn" style={{ color: 'var(--success)' }}
                      onClick={() => moderatePost(post.id, 'approve')}>✓ 通过</button>
                    <button className="com-action-btn" style={{ color: 'var(--danger)' }}
                      onClick={() => moderatePost(post.id, 'reject')}>✕ 拒绝</button>
                  </>
                )}
              </div>
              {openComments.has(post.id) && (
                <div className="com-comments-wrap">
                  <div className="com-comments-section">
                    {(comments[post.id] ?? []).map(c => (
                      <div key={c.id} className="com-comment" style={{ marginLeft: (c.parent_id ? 20 : 0) }}>
                        <div className="com-comment-header">
                          <span className="com-comment-author" style={{ cursor: 'pointer' }} onClick={() => openUser(c.author_id)}>
                            {c.author_nickname}
                          </span>
                          <span className="com-comment-time">{timeAgo(c.created_at)}</span>
                        </div>
                        <div className="com-comment-body">{c.body}</div>
                        <div className="com-comment-actions">
                          <span className="com-comment-reply-btn" onClick={() => {
                            setReplyTo({ postId: post.id, commentId: c.id, nickname: c.author_nickname })
                            if (!openComments.has(post.id)) toggleComments(post.id)
                          }}>回复</span>
                          {c.author_id === user.id && (
                            <span className="com-comment-reply-btn" onClick={async () => {
                              try {
                                await community.deleteComment(c.id)
                                const res = await community.getComments(post.id)
                                setComments(prev => ({ ...prev, [post.id]: res.data.comments ?? [] }))
                              } catch (e) {
                                setError(getErrorMessage(e, '删除评论失败'))
                              }
                            }}>删除</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="com-comment-input-row">
                    {replyTo?.postId === post.id && (
                      <div className="com-reply-to">
                        回复 @{replyTo.nickname}
                        <span className="com-reply-cancel" onClick={() => setReplyTo(null)}>✕</span>
                      </div>
                    )}
                    <input value={commentBodies[post.id] ?? ''}
                      onChange={e => setCommentBodies(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(post.id) } }}
                      placeholder="写评论…" className="com-comment-input" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {hasMore && (
        <button className="com-load-more" onClick={() => {
          if (selectedGroup) loadPosts(page + 1, { groupId: selectedGroup.id })
          else loadPosts(page + 1, { tab: activeTab })
        }} disabled={loading}>
          {loading ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // RENDER: MAIN
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="com-layout">
      <div className="com-main">
        {/* Top nav tabs */}
        <div className="com-tabs">
          <button className={`com-tab ${view === 'global' ? 'active' : ''}`} onClick={goToGlobal}>
            广场
          </button>
          <button className={`com-tab ${view === 'groups' || view === 'group-detail' ? 'active' : ''}`} onClick={goToGroups}>
            小组
          </button>
          {view === 'global' && (
            <>
              <button className={`com-tab sub ${activeTab === 'trending' ? 'active' : ''}`}
                onClick={() => switchGlobalTab('trending')}>推荐</button>
              <button className={`com-tab sub ${activeTab === 'hot' ? 'active' : ''}`}
                onClick={() => switchGlobalTab('hot')}>热门</button>
              <button className={`com-tab sub ${activeTab === 'following' ? 'active' : ''}`}
                onClick={() => switchGlobalTab('following')}>关注</button>
            </>
          )}
          {view === 'group-detail' && selectedGroup && (
            <span className="com-breadcrumb">
              <span className="com-breadcrumb-sep">/</span>
              <span className="com-breadcrumb-current">{selectedGroup.name}</span>
            </span>
          )}
          <div style={{ flex: 1 }} />
          <div className="com-search-box">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
              placeholder="搜索帖子…" className="com-search-input" />
            {searchQuery && (
              <span className="com-search-clear" onClick={() => { setSearchQuery(''); loadPosts(1, { tab: activeTab }) }}>✕</span>
            )}
          </div>
          <div className="com-notif-bell" ref={notifRef} style={{ position: 'relative', cursor: 'pointer', padding: '4px 8px' }}>
            <span onClick={() => setShowNotifs(prev => !prev)}>
              🔔{notifCount > 0 && <span className="com-notif-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
            </span>
            {showNotifs && (
              <div className="com-notif-dropdown">
                <div className="com-notif-header">
                  通知
                  <span className="com-notif-readall" onClick={async () => {
                    try {
                      await community.readNotifications()
                      setNotifCount(0)
                    } catch (e) {
                      setError(getErrorMessage(e, '通知标记失败'))
                    }
                  }}>标为已读</span>
                </div>
                {notifList.length === 0 && <div className="com-notif-empty">暂无通知</div>}
                {notifList.map(n => (
                  <div key={n.id} className={`com-notif-item ${!n.is_read ? 'unread' : ''}`}>
                    <span className="com-notif-actor">{n.actor_nickname}</span>
                    <span className="com-notif-action">{NOTIF_LABELS[n.kind] || n.kind}</span>
                    <span className="com-notif-time">{timeAgo(n.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="com-bookmark-btn" onClick={loadBookmarks} title="收藏">⭐</button>
	        </div>
        {renderErrorBanner()}

        {/* Global: hashtags */}
        {view === 'global' && activeTag && (
          <div className="com-tag-filter">
            话题：#{activeTag}
            <button className="com-tag-clear" onClick={() => { setActiveTag(null); loadPosts(1, { tab: activeTab }) }}>✕</button>
          </div>
        )}

        {/* Views */}
        {view === 'groups' && renderGroupsView()}
        {view === 'group-detail' && renderGroupDetail()}

        {/* Global feed */}
        {view === 'global' && (
          <>
            {renderComposer()}
            {renderPostList()}
          </>
        )}
      </div>

      {/* Right sidebar */}
      <div className="com-sidebar">
        {view === 'global' && (
          <>
            <div className="com-sidebar-section">
              <h3 className="com-sidebar-title">推荐关注</h3>
              {suggestedUsers.length === 0 && <div className="com-sidebar-empty">暂无推荐</div>}
              {suggestedUsers.map(u => (
                <div key={u.id} className="com-sidebar-user">
                  <div className="com-sidebar-user-info" onClick={() => openUser(u.id)} style={{ cursor: 'pointer' }}>
                    <Avatar name={u.nickname} size={32} />
                    <div className="com-sidebar-user-text">
                      <div className="com-sidebar-user-name">{u.nickname}</div>
                      <div className="com-sidebar-user-meta">{u.post_count} 帖子 · {u.follower_count} 粉丝</div>
                    </div>
                  </div>
                  <button className={`com-sidebar-follow-btn ${followed.has(u.id) ? 'following' : ''}`}
                    onClick={() => toggleFollow(u.id)}>
                    {followed.has(u.id) ? '已关注' : '关注'}
                  </button>
                </div>
              ))}
            </div>
            <div className="com-sidebar-section">
              <h3 className="com-sidebar-title">热门小组</h3>
              <div className="com-sidebar-empty">
                <span style={{ cursor: 'pointer', color: 'var(--brand)' }} onClick={goToGroups}>查看全部 →</span>
              </div>
            </div>
          </>
        )}
        {view === 'group-detail' && groupDetail && (
          <div className="com-sidebar-section">
            <h3 className="com-sidebar-title">小组信息</h3>
            <div className="com-sidebar-info">
              <p><strong>名称：</strong>{groupDetail.name}</p>
              <p><strong>分类：</strong>{groupDetail.category === 'region' ? '地区' : '兴趣'}</p>
              <p><strong>加入方式：</strong>{groupDetail.join_policy === 'apply' ? '申请加入' : '开放加入'}</p>
              <p><strong>成员：</strong>{groupDetail.member_count ?? 0} 人</p>
              {groupDetail.owner_nickname && <p><strong>组长：</strong>{groupDetail.owner_nickname}</p>}
            </div>
          </div>
        )}
        {view === 'groups' && (
          <div className="com-sidebar-section">
            <h3 className="com-sidebar-title">小组分类</h3>
            <div className="com-sidebar-info">
              <p style={{ cursor: 'pointer' }} onClick={() => { setGroupCategory('region'); loadGroups('region') }}>📍 地区小组</p>
              <p style={{ cursor: 'pointer' }} onClick={() => { setGroupCategory('interest'); loadGroups('interest') }}>🎯 兴趣小组</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="com-modal-overlay" onClick={() => setShowCreateGroup(false)}>
          <div className="com-modal" onClick={e => e.stopPropagation()}>
            <h3 className="com-modal-title">创建小组</h3>
            <div className="com-modal-field">
              <label>名称</label>
              <input value={newGroup.name} onChange={e => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                placeholder="小组名称" className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>简介</label>
              <textarea value={newGroup.description} onChange={e => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
                placeholder="小组简介" rows={3} className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>分类</label>
              <select value={newGroup.category} onChange={e => setNewGroup(prev => ({ ...prev, category: e.target.value }))}
                className="com-modal-input">
                <option value="interest">兴趣</option>
                <option value="region">地区</option>
              </select>
            </div>
            <div className="com-modal-field">
              <label>加入方式</label>
              <select value={newGroup.join_policy} onChange={e => setNewGroup(prev => ({ ...prev, join_policy: e.target.value }))}
                className="com-modal-input">
                <option value="apply">申请加入</option>
                <option value="open">开放加入</option>
              </select>
            </div>
            <div className="com-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateGroup(false)}>取消</button>
              <button className="btn btn-primary" onClick={createGroup} disabled={creatingGroup || !newGroup.name.trim()}>
                {creatingGroup ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateEvent && (
        <div className="com-modal-overlay" onClick={() => setShowCreateEvent(false)}>
          <div className="com-modal" onClick={e => e.stopPropagation()}>
            <h3 className="com-modal-title">创建活动</h3>
            <div className="com-modal-field">
              <label>标题</label>
              <input value={newEvent.title} onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                placeholder="活动标题" className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>描述</label>
              <textarea value={newEvent.description} onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                placeholder="活动描述" rows={3} className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>地点</label>
              <input value={newEvent.location} onChange={e => setNewEvent(prev => ({ ...prev, location: e.target.value }))}
                placeholder="活动地点" className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>开始时间</label>
              <input type="datetime-local" value={newEvent.starts_at} onChange={e => setNewEvent(prev => ({ ...prev, starts_at: e.target.value }))}
                className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>结束时间</label>
              <input type="datetime-local" value={newEvent.ends_at} onChange={e => setNewEvent(prev => ({ ...prev, ends_at: e.target.value }))}
                className="com-modal-input" />
            </div>
            <div className="com-modal-field">
              <label>人数上限</label>
              <input type="number" value={newEvent.max_attendees} onChange={e => setNewEvent(prev => ({ ...prev, max_attendees: e.target.value }))}
                placeholder="不限" className="com-modal-input" />
            </div>
            <div className="com-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateEvent(false)}>取消</button>
              <button className="btn btn-primary" onClick={createEvent} disabled={!newEvent.title.trim() || !newEvent.starts_at}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="com-modal-overlay" onClick={() => setShowReport(null)}>
          <div className="com-modal" onClick={e => e.stopPropagation()}>
            <h3 className="com-modal-title">举报</h3>
            <div className="com-modal-field">
              <label>原因</label>
              <select value={reportReason} onChange={e => setReportReason(e.target.value)} className="com-modal-input">
                <option value="spam">垃圾信息</option>
                <option value="inappropriate">不当内容</option>
                <option value="fraud">欺诈</option>
                <option value="harassment">骚扰</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div className="com-modal-field">
              <label>详情</label>
              <textarea value={reportDetail} onChange={e => setReportDetail(e.target.value)}
                placeholder="补充说明（可选）" rows={3} className="com-modal-input" />
            </div>
            <div className="com-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReport(null)}>取消</button>
              <button className="btn btn-primary" onClick={submitReport}>提交举报</button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks Modal */}
      {showBookmarks && (
        <div className="com-modal-overlay" onClick={() => setShowBookmarks(false)}>
          <div className="com-modal com-modal-wide" onClick={e => e.stopPropagation()}>
            <h3 className="com-modal-title">我的收藏</h3>
            {bookmarks.length === 0 && <div className="com-empty">暂无收藏</div>}
            {bookmarks.map(p => (
              <div key={p.id} className="com-post" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
                <div className="com-post-content">{renderContent(p.content)}</div>
                <div className="com-post-time">{timeAgo(p.created_at)}</div>
              </div>
            ))}
            <div className="com-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowBookmarks(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
