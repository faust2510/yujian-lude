import { useEffect, useState } from 'react'
import { XMobileEmptyState } from '../../components/x-mobile/XMobileEmptyState'
import { XMobileErrorRow } from '../../components/x-mobile/XMobileErrorRow'
import { XMobileFab } from '../../components/x-mobile/XMobileFab'
import { XMobileSkeleton } from '../../components/x-mobile/XMobileSkeleton'
import { XMobileTabs } from '../../components/x-mobile/XMobileTabs'
import { XMobileTimelineRow } from '../../components/x-mobile/XMobileTimelineRow'

const feedTabs = [{ value: 'following', label: '关注' }, { value: 'hot', label: '热门' }, { value: 'trending', label: '推荐' }]
const groupTabs = [{ value: 'posts', label: '帖子' }, { value: 'members', label: '成员' }, { value: 'events', label: '活动' }, { value: 'announcements', label: '公告' }]

function timeAgo(iso) {
  if (!iso) return ''
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function Panel({ title, onClose, children }) {
  return <section className="x-mobile-overlay-panel" role="dialog" aria-modal="true" aria-label={title}><div className="x-mobile-detail-header"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={onClose}>关闭</button><div><h2>{title}</h2></div><span /></div>{children}</section>
}

export default function CommunityMobile({ controller: c }) {
  const [composerOpen, setComposerOpen] = useState(false)
  const posts = c.posts || []

  useEffect(() => { setComposerOpen(false) }, [c.activeTab, c.selectedGroup?.id, c.view])

  if (c.loading && posts.length === 0 && c.view === 'global') return <XMobileSkeleton lines={8} />

  if (c.view === 'groups') {
    return (
      <section className="x-mobile-list">
        <div className="x-mobile-detail-header"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={c.goGlobal}>返回</button><div><h2>小组</h2></div><button type="button" className="x-mobile-icon-button x-mobile-touch-target" aria-label="创建小组" onClick={() => c.setShowCreateGroup?.(!c.showCreateGroup)}>＋</button></div>
        <div className="x-mobile-filter-row"><input aria-label="搜索小组" placeholder="搜索小组" value={c.groupSearch || ''} onChange={(event) => c.setGroupSearch?.(event.target.value)} /><select aria-label="小组分类" value={c.groupCategory || ''} onChange={(event) => c.setGroupCategory?.(event.target.value)}><option value="">全部分类</option><option value="interest">兴趣</option><option value="region">地区</option><option value="church">教会</option><option value="study">学习</option></select><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => c.loadGroups?.(c.groupCategory, c.groupSearch)}>搜索</button></div>
        {c.showCreateGroup ? <form className="x-mobile-inline-form" onSubmit={(event) => { event.preventDefault(); c.createGroup?.() }}><label>小组名称<input value={c.newGroup?.name || ''} onChange={(event) => c.setNewGroup?.((current) => ({ ...current, name: event.target.value }))} /></label><label>简介<textarea rows="3" value={c.newGroup?.description || ''} onChange={(event) => c.setNewGroup?.((current) => ({ ...current, description: event.target.value }))} /></label><button className="x-mobile-button-primary x-mobile-touch-target" disabled={c.creatingGroup || !c.newGroup?.name?.trim()}>{c.creatingGroup ? '创建中…' : '创建小组'}</button></form> : null}
        {c.error ? <XMobileErrorRow message={c.error} onRetry={c.retry} /> : null}
        {c.loadingGroups ? <XMobileSkeleton lines={6} /> : c.groups?.length ? c.groups.map((group) => <button type="button" className="x-mobile-list-row x-mobile-touch-target" key={group.id} onClick={() => c.openGroup?.(group)}><span><strong>{group.name}</strong><small>{group.description || '暂无简介'}</small></span><span className="x-mobile-row-meta">{group.member_count || 0} 人</span></button>) : <XMobileEmptyState title="暂无小组" />}
      </section>
    )
  }

  if (c.view === 'group-detail') return <GroupDetail controller={c} composerOpen={composerOpen} setComposerOpen={setComposerOpen} />

  return (
    <section className="x-mobile-timeline">
      <XMobileTabs items={feedTabs} value={c.activeTab} onChange={c.changeTab || c.setActiveTab} ariaLabel="社区时间线" />
      <div className="x-mobile-community-tools"><button type="button" className="x-mobile-touch-target" onClick={c.goGroups || (() => c.navigateView?.('groups'))}>小组</button><button type="button" className="x-mobile-touch-target" onClick={() => c.setShowNotifs?.(true)}>通知{c.notifCount ? ` ${c.notifCount}` : ''}</button><button type="button" className="x-mobile-touch-target" onClick={c.loadBookmarks}>收藏</button></div>
      <form className="x-mobile-search-row" onSubmit={(event) => { event.preventDefault(); c.search?.() }}><input aria-label="搜索社区" value={c.searchQuery || ''} onChange={(event) => c.setSearchQuery?.(event.target.value)} placeholder="搜索帖子" /><button className="x-mobile-touch-target">搜索</button></form>
      {c.activeTag ? <div className="x-mobile-status-row">话题 #{c.activeTag}<button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.goGlobal?.()}>清除</button></div> : null}
      {composerOpen ? <Composer controller={c} onDone={() => setComposerOpen(false)} /> : null}
      {c.error ? <XMobileErrorRow message={c.error} onRetry={c.retry || (() => c.loadPosts?.(1, { tab: c.activeTab }))} /> : null}
      {!c.loading && !c.error && posts.length === 0 ? <XMobileEmptyState title="暂时没有动态" /> : null}
      {posts.map((post) => <CommunityPost post={post} controller={c} key={post.id} />)}
      {c.hasMore ? <button type="button" className="x-mobile-load-more x-mobile-touch-target" disabled={c.loading} onClick={c.loadMore}>{c.loading ? '加载中…' : '加载更多'}</button> : null}
      {c.suggestedUsers?.length ? <section className="x-mobile-suggestions"><h2>推荐关注</h2>{c.suggestedUsers.slice(0, 4).map((person) => <div className="x-mobile-list-row" key={person.id}><span><strong>{person.nickname || person.email}</strong><small>{person.intro || '平台用户'}</small></span><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.toggleFollow?.(person.id)}>{c.followed?.has?.(person.id) ? '取消关注' : '关注'}</button></div>)}</section> : null}
      <XMobileFab label="发布动态" onClick={() => setComposerOpen((open) => !open)}>＋</XMobileFab>
      {c.showNotifs ? <Panel title="通知" onClose={() => c.setShowNotifs?.(false)}><div className="x-mobile-action-stack"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={c.markNotificationsRead}>全部已读</button></div>{c.notifList?.length ? c.notifList.map((item) => <div className="x-mobile-list-row" key={item.id}><span><strong>{item.title || item.type || '社区通知'}</strong><small>{item.body || item.content || timeAgo(item.created_at)}</small></span></div>) : <XMobileEmptyState title="暂无通知" />}</Panel> : null}
      {c.showBookmarks ? <Panel title="我的收藏" onClose={() => c.setShowBookmarks?.(false)}>{c.bookmarks?.length ? c.bookmarks.map((post) => <CommunityPost post={post} controller={c} key={post.id} />) : <XMobileEmptyState title="暂无收藏" />}</Panel> : null}
      {c.showReport ? <ReportPanel controller={c} /> : null}
    </section>
  )
}

function Composer({ controller: c, onDone }) {
  return <form className="x-mobile-composer-sheet" onSubmit={async (event) => { event.preventDefault(); await c.submitPost?.(); onDone?.() }}><label htmlFor="community-title">标题（可选）</label><input id="community-title" value={c.title || ''} onChange={(event) => c.setTitle?.(event.target.value)} /><label htmlFor="community-post">发布内容</label><textarea id="community-post" rows="5" value={c.content || ''} onChange={(event) => c.setContent?.(event.target.value)} /><label htmlFor="community-image">图片地址（可选）</label><input id="community-image" inputMode="url" value={c.imageUrl || ''} onChange={(event) => c.setImageUrl?.(event.target.value)} /><button type="submit" className="x-mobile-button-primary x-mobile-touch-target" disabled={c.posting || !c.content?.trim()}>{c.posting ? '发布中…' : '发布'}</button></form>
}

function GroupDetail({ controller: c, composerOpen, setComposerOpen }) {
  const group = c.groupDetail || c.selectedGroup
  const canCompose = c.isMember && c.activeTab === 'posts'
  return <section className="x-mobile-settings-page"><div className="x-mobile-detail-header"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={c.goGroups}>返回</button><div><h2>{group?.name || '小组详情'}</h2><p>{group?.member_count || 0} 人</p></div>{!c.isMember ? <button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => c.joinGroup?.(group?.id)}>加入</button> : <span />}</div><XMobileTabs items={groupTabs} value={c.activeTab} onChange={c.changeTab} ariaLabel="小组内容" />{c.error ? <XMobileErrorRow message={c.error} onRetry={c.retry} /> : null}{c.activeTab === 'members' ? <Members controller={c} /> : c.activeTab === 'events' ? <Events controller={c} /> : <>{canCompose && composerOpen ? <Composer controller={c} onDone={() => setComposerOpen(false)} /> : null}{(c.posts || []).length ? (c.posts || []).map((post) => <CommunityPost post={post} controller={c} key={post.id} />) : <XMobileEmptyState title={c.activeTab === 'announcements' ? '暂无公告' : '暂无帖子'} />}{c.hasMore ? <button type="button" className="x-mobile-load-more x-mobile-touch-target" onClick={c.loadMore}>加载更多</button> : null}{canCompose ? <XMobileFab label="发布小组动态" onClick={() => setComposerOpen((open) => !open)}>＋</XMobileFab> : null}</>}{c.showReport ? <ReportPanel controller={c} /> : null}</section>
}

function Members({ controller: c }) {
  return <section>{(c.members || []).map((member) => <div className="x-mobile-list-row" key={member.user_id}><span><strong>{member.nickname || member.email}</strong><small>{member.role}</small></span>{c.isAdmin && member.user_id !== c.currentUser?.id ? <div className="x-mobile-row-actions"><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.moderateMember?.(member.user_id, 'promote')}>设为管理</button><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.moderateMember?.(member.user_id, 'kick')}>移出</button></div> : null}</div>)}{c.isAdmin && c.pendingRequests?.length ? <><div className="x-mobile-section-header"><h2>待审核成员</h2></div>{c.pendingRequests.map((member) => <div className="x-mobile-list-row" key={`pending-${member.user_id}`}><span><strong>{member.nickname || member.email}</strong><small>申请加入</small></span><div className="x-mobile-row-actions"><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => c.moderateMember?.(member.user_id, 'approve')}>通过</button><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.moderateMember?.(member.user_id, 'reject')}>拒绝</button></div></div>)}</> : null}</section>
}

function Events({ controller: c }) {
  return <section>{c.isAdmin ? <div className="x-mobile-action-stack"><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => c.setShowCreateEvent?.(!c.showCreateEvent)}>创建活动</button></div> : null}{c.showCreateEvent ? <form className="x-mobile-inline-form" onSubmit={(event) => { event.preventDefault(); c.createEvent?.() }}><label>活动名称<input value={c.newEvent?.title || ''} onChange={(event) => c.setNewEvent?.((current) => ({ ...current, title: event.target.value }))} /></label><label>地点<input value={c.newEvent?.location || ''} onChange={(event) => c.setNewEvent?.((current) => ({ ...current, location: event.target.value }))} /></label><label>开始时间<input type="datetime-local" value={c.newEvent?.starts_at || ''} onChange={(event) => c.setNewEvent?.((current) => ({ ...current, starts_at: event.target.value }))} /></label><button className="x-mobile-button-primary x-mobile-touch-target">创建</button></form> : null}{(c.events || []).length ? c.events.map((event) => <div className="x-mobile-list-row" key={event.id}><span><strong>{event.title}</strong><small>{event.location || '待定'} · {event.starts_at ? new Date(event.starts_at).toLocaleString('zh-CN') : '时间待定'}</small></span><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.rsvpEvent?.(event.id, event.my_rsvp === 'going' ? 'cancelled' : 'going')}>{event.my_rsvp === 'going' ? '取消报名' : '报名'}</button></div>) : <XMobileEmptyState title="暂无活动" />}</section>
}

function ReportPanel({ controller: c }) {
  return <Panel title="举报内容" onClose={() => c.setShowReport?.(null)}><form className="x-mobile-inline-form" onSubmit={(event) => { event.preventDefault(); c.submitReport?.() }}><label>原因<select value={c.reportReason || 'spam'} onChange={(event) => c.setReportReason?.(event.target.value)}><option value="spam">垃圾信息</option><option value="harassment">骚扰</option><option value="inappropriate">不当内容</option><option value="other">其他</option></select></label><label>补充说明<textarea rows="4" value={c.reportDetail || ''} onChange={(event) => c.setReportDetail?.(event.target.value)} /></label><button className="x-mobile-button-primary x-mobile-touch-target">提交举报</button></form></Panel>
}

function CommunityPost({ post, controller: c }) {
  const liked = Boolean(post.liked_by_me)
  const bookmarked = Boolean(post.bookmarked_by_me)
  const ownPost = post.author_id === c.currentUser?.id
  return <XMobileTimelineRow title={post.author_nickname || '平台用户'} meta={timeAgo(post.created_at)}><button type="button" className="x-mobile-post-author" onClick={() => c.openUser?.(post.author_id)}>{post.title ? <strong>{post.title}</strong> : null}<span>{post.content}</span></button>{post.image_url ? <img className="x-mobile-post-media" src={post.image_url} alt="帖子图片" /> : null}<div className="x-mobile-post-actions"><button type="button" className="x-mobile-touch-target" aria-label={liked ? '取消点赞' : '点赞'} onClick={() => c.toggleLike?.(post.id)}>{liked ? '已赞' : '点赞'}{post.like_count ? ` ${post.like_count}` : ''}</button><button type="button" className="x-mobile-touch-target" aria-label="评论" onClick={() => c.toggleComments?.(post.id)}>评论{post.comment_count ? ` ${post.comment_count}` : ''}</button><button type="button" className="x-mobile-touch-target" aria-label={bookmarked ? '取消收藏' : '收藏'} onClick={() => c.toggleBookmark?.(post.id)}>{bookmarked ? '已收藏' : '收藏'}</button><button type="button" className="x-mobile-touch-target" aria-label="举报" onClick={() => c.setShowReport?.({ target_type: 'post', target_id: post.id })}>举报</button></div>{!ownPost && post.author_id ? <button type="button" className="x-mobile-follow-inline x-mobile-touch-target" onClick={() => c.toggleFollow?.(post.author_id)}>{c.followed?.has?.(post.author_id) ? '取消关注' : '关注作者'}</button> : null}{ownPost ? <button type="button" className="x-mobile-follow-inline x-mobile-touch-target" onClick={() => c.deletePost?.(post.id)}>删除帖子</button> : null}{c.isAdmin ? <div className="x-mobile-moderation-actions">{post.state !== 'pinned' ? <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.featurePost?.(post.id, 'pin')}>置顶</button> : <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.featurePost?.(post.id, 'unpin')}>取消置顶</button>}{post.state !== 'featured' ? <button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.featurePost?.(post.id, 'feature')}>设为精华</button> : null}{post.moderation === 'pending' ? <><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => c.moderatePost?.(post.id, 'approve')}>审核通过</button><button type="button" className="x-mobile-button-secondary x-mobile-touch-target" onClick={() => c.moderatePost?.(post.id, 'reject')}>审核拒绝</button></> : null}</div> : null}{c.openComments?.has?.(post.id) ? <div className="x-mobile-comments">{(c.comments?.[post.id] || []).map((comment) => <div key={comment.id}>{comment.author_nickname || '用户'}：{comment.body}</div>)}<label className="x-mobile-sr-only" htmlFor={`comment-${post.id}`}>回复</label><input id={`comment-${post.id}`} value={c.commentBodies?.[post.id] || ''} onChange={(event) => c.setCommentBodies?.((current) => ({ ...current, [post.id]: event.target.value }))} /><button type="button" className="x-mobile-button-primary x-mobile-touch-target" onClick={() => c.submitComment?.(post.id)}>回复</button></div> : null}</XMobileTimelineRow>
}
