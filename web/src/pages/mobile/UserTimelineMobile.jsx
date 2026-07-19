import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'
import { XMobileTimelineRow } from '../../components/x-mobile/XMobileTimelineRow'

function timeAgo(iso) {
  if (!iso) return ''
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export default function UserTimelineMobile({ profile, posts = [], followed = false, loading = false, profileLoading = false, error = '', profileError = '', isSelf = false, hasMore = false, onBack, onFollow, onLike, onLoadMore, onRetryPosts, onRetryProfile }) {
  if (!profile && profileLoading && !isSelf) return <XMobileSkeleton lines={8} />
  return (
    <section className="x-mobile-profile-timeline">
      <div className="x-mobile-detail-header"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={onBack}>返回</button><div><h2>{profile?.nickname || (isSelf ? '我的主页' : '用户动态')}</h2><p>{profile?.post_count || posts.length || 0} 帖子</p></div><span /></div>
      {profileError ? <XMobileErrorRow message={profileError} onRetry={onRetryProfile} /> : null}
      {isSelf ? <XMobileEmptyState title="这是你的主页" description="回到社区查看活动和动态。" /> : null}
      {profile ? <header className="x-mobile-user-profile"><div className="x-mobile-large-avatar" aria-hidden="true">{profile.nickname?.slice(0, 1) || '路'}</div><div className="x-mobile-user-profile-copy"><h2>{profile.nickname}</h2><p>{profile.intro || ''}</p><span>{profile.following_count || 0} 关注 · {profile.follower_count || 0} 粉丝</span></div><button type="button" className={followed ? 'x-mobile-button-secondary x-mobile-touch-target' : 'x-mobile-button-primary x-mobile-touch-target'} onClick={onFollow}>{followed ? '取消关注' : '关注'}</button></header> : null}
      {!isSelf && error ? <XMobileErrorRow message={error} onRetry={onRetryPosts} /> : null}
      {!isSelf ? (!loading && !error && posts.length === 0 ? <XMobileEmptyState title="暂时没有动态" /> : posts.map((post) => <XMobileTimelineRow title={post.author_nickname || profile?.nickname || '用户'} meta={timeAgo(post.created_at)} key={post.id}>{post.title ? <h3 className="x-mobile-post-title">{post.title}</h3> : null}<p>{post.content}</p>{post.image_url ? <img className="x-mobile-post-media" src={post.image_url} alt="帖子图片" /> : null}<button type="button" className="x-mobile-icon-action x-mobile-touch-target" aria-label={post.liked_by_me ? '取消点赞' : '点赞'} onClick={() => onLike?.(post.id)}>{post.liked_by_me ? '已赞' : '点赞'}{post.like_count ? ` ${post.like_count}` : ''}</button><span className="x-mobile-row-meta">评论 {post.comment_count || 0}</span></XMobileTimelineRow>)) : null}
      {!isSelf && hasMore ? <button type="button" className="x-mobile-load-more x-mobile-touch-target" disabled={loading} onClick={onLoadMore}>{loading ? '加载中…' : '加载更多'}</button> : null}
    </section>
  )
}
