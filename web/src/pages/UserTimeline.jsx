import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { community } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import useMobileViewport from '../hooks/useMobileViewport'
import UserTimelineMobile from './mobile/UserTimelineMobile'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`
  if (s < 2592000) return `${Math.floor(s / 86400)}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function Avatar({ name, size = 40 }) {
  return (
    <div className="com-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name?.[0] ?? '?'}
    </div>
  )
}

export default function UserTimeline() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const isMobile = useMobileViewport()
  const currentUserId = currentUser?.id

  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [followed, setFollowed] = useState(false)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const profileRequestRef = useRef(0)
  const postsRequestRef = useRef(0)

  const loadProfile = useCallback(async () => {
    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId
    if (!userId || userId === currentUserId) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    setProfile(null)
    setProfileError('')
    setProfileLoading(true)
    try {
      const r = await community.userProfile(userId)
      if (profileRequestRef.current !== requestId) return
      setProfile(r.data.profile)
      setFollowed(r.data.profile.followed_by_me)
    } catch (e) {
      if (profileRequestRef.current !== requestId) return
      setProfileError(e.response?.data?.error || '用户资料加载失败')
    } finally {
      if (profileRequestRef.current === requestId) setProfileLoading(false)
    }
  }, [currentUserId, userId])

  useEffect(() => { loadProfile() }, [loadProfile])

  const loadPosts = useCallback(async (p = 1) => {
    const requestId = postsRequestRef.current + 1
    postsRequestRef.current = requestId
    setLoading(true)
    setError('')
    try {
      const res = await community.userPosts(userId, { page: p })
      if (postsRequestRef.current !== requestId) return
      const newPosts = res.data.posts ?? []
      setPosts(prev => p === 1 ? newPosts : [...prev, ...newPosts])
      setPage(p)
      setHasMore(newPosts.length >= 20)
    } catch (e) {
      if (postsRequestRef.current !== requestId) return
      setError(e.response?.data?.error || '动态加载失败')
    } finally {
      if (postsRequestRef.current === requestId) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (userId && userId !== currentUserId) loadPosts(1)
    else {
      postsRequestRef.current += 1
      setPosts([])
      setLoading(false)
    }
  }, [currentUserId, loadPosts, userId])

  const toggleFollow = async () => {
    try {
      const res = await community.follow(userId)
      setFollowed(res.data.following)
      setProfile(prev => prev ? {
        ...prev,
        follower_count: prev.follower_count + (res.data.following ? 1 : -1)
      } : prev)
    } catch (e) {
      setError(e.response?.data?.error || '关注失败')
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
      setError(e.response?.data?.error || '点赞失败')
    }
  }

  if (isMobile) {
    return <UserTimelineMobile profile={profile} posts={posts} followed={followed} loading={loading} profileLoading={profileLoading} error={error} profileError={profileError} isSelf={userId === currentUserId} hasMore={hasMore} onBack={() => navigate('/community')} onFollow={toggleFollow} onLike={toggleLike} onLoadMore={() => loadPosts(page + 1)} onRetryPosts={() => loadPosts(1)} onRetryProfile={loadProfile} />
  }

  if (profileError && userId !== currentUserId) {
    return (
      <div className="com-layout">
        <div className="com-main">
          <div className="com-tabs">
            <button className="com-tab" onClick={() => navigate('/community')}>
              ← 社群
            </button>
          </div>
          <div className="com-error" style={{ margin: 24 }}>{profileError}</div>
        </div>
      </div>
    )
  }

  if (!profile && userId !== currentUserId) {
    return <div className="com-loading" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>加载中…</div>
  }

  if (userId === currentUserId) {
    return (
      <div className="com-layout">
        <div className="com-main">
          <div className="com-tabs">
            <button className="com-tab active" onClick={() => navigate('/community')}>
              ← 回到社群
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>这是你的主页</span>
          </div>
          <div className="com-empty">这是你自己的页面，去社群板块查看活动吧</div>
        </div>
      </div>
    )
  }

  return (
    <div className="com-layout">
      <div className="com-main">
        <div className="com-tabs">
          <button className="com-tab" onClick={() => navigate('/community')}>
            ← 社群
          </button>
        </div>

        <div className="com-profile-card">
          <div className="com-profile-header">
            <Avatar name={profile.nickname} size={64} />
            <div className="com-profile-info">
              <h2>{profile.nickname}</h2>
              {profile.intro && <p className="com-profile-intro">{profile.intro}</p>}
              <div className="com-profile-stats">
                <span><strong>{profile.post_count}</strong> 帖子</span>
                <span><strong>{profile.follower_count}</strong> 粉丝</span>
                <span><strong>{profile.following_count}</strong> 关注</span>
              </div>
            </div>
            <button
              className={`com-profile-follow-btn ${followed ? 'following' : ''}`}
              onClick={toggleFollow}
            >
              {followed ? '已关注' : '关注'}
            </button>
          </div>
        </div>

        <div className="com-feed">
          {error && <div className="com-error" style={{ margin: '0 0 12px 0' }}>{error}</div>}
          {!loading && posts.length === 0 && (
            <div className="com-empty">该用户暂无帖子</div>
          )}
          {posts.map(post => (
            <div key={post.id} className="com-post">
              <div className="com-post-main">
                <Avatar name={post.author_nickname} />
                <div className="com-post-body">
                  <div className="com-post-header">
                    <span className="com-post-author">{post.author_nickname}</span>
                    <span className="com-post-time">{timeAgo(post.created_at)}</span>
                  </div>
                  <div className="com-post-content">{post.content}</div>
                  <div className="com-post-actions">
                    <button className={`com-action-btn ${post.liked_by_me ? 'liked' : ''}`}
                      onClick={() => toggleLike(post.id)}>
                      {post.liked_by_me ? '❤️' : '🤍'} {post.like_count > 0 && post.like_count}
                    </button>
                    <button className="com-action-btn">
                      💬 {post.comment_count > 0 && post.comment_count}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <button className="com-load-more" onClick={() => loadPosts(page + 1)} disabled={loading}>
              {loading ? '加载中…' : '加载更多'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
