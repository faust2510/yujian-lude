import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const community = read('pages/Community.jsx')
const timeline = read('pages/UserTimeline.jsx')
const comments = read('components/community/PostComments.jsx')

test('community pagination keeps the authoritative feed scope for search tags and announcements', () => {
  assert.match(community, /const feedScopeRef = useRef\(\{ tab: 'trending' \}\)/)
  assert.match(community, /if \(opts\.search\) \{\s*res = await community\.search\(\{ q: opts\.search, page: p \}\)/)
  assert.match(community, /const loadMorePosts = \(\) => loadPosts\(page \+ 1, feedScopeRef\.current\)/)
  assert.match(community, /loadPosts\(1, \{ search: searchQuery\.trim\(\) \}\)/)
  assert.doesNotMatch(community, /setHasMore\(false\)/)
  assert.match(community, /loadPosts\(1, \{ groupId: selectedGroup\.id, postType: 'announcement' \}\)/)
  assert.match(community, /loadPosts\(1, \{ tag \}\)/)
})

test('stale feed and group responses cannot overwrite a newly selected view', () => {
  assert.match(community, /const postsRequest = useRef\(0\)/)
  assert.match(community, /const activeGroupRef = useRef\(null\)/)
  assert.match(community, /const requestId = \+\+postsRequest\.current/)
  assert.match(community, /if \(requestId !== postsRequest\.current\) return/)
  assert.match(community, /activeGroupRef\.current = group\.id[\s\S]{0,500}loadGroupDetail\(group\.id\)/)
  for (const loader of ['loadGroupDetail', 'loadMembers', 'loadPending', 'loadEvents']) {
    const start = community.indexOf(`const ${loader} = async (groupId) =>`)
    assert.notEqual(start, -1, `${loader} should exist`)
    const body = community.slice(start, community.indexOf('\n  }', start) + 4)
    assert.match(body, /activeGroupRef\.current !== groupId/, `${loader} should reject stale group responses`)
  }
})

test('comments and user timelines expose report actions for other users content', () => {
  assert.match(comments, /onReport/)
  assert.match(comments, /onReport\?\.\(comment\.id\)/)
  assert.match(comments, /onReport\?\.\(reply\.id\)/)
  assert.match(community, /onReport=\{commentId => openReport\(\{ target_type: 'comment', target_id: commentId \}\)\}/)
  assert.match(timeline, /openReport\(\{ target_type: 'user', target_id: userId \}\)/)
  assert.match(timeline, /community\.report\(\{ \.\.\.target, reason: reportReason, detail: reportDetail\.trim\(\) \}\)/)
  assert.match(timeline, />举报用户<\/button>/)
})

test('notifications and bookmarks paginate without presenting failed loads as empty', () => {
  assert.match(community, /const loadNotifications = useCallback\(async \(p = 1\) =>/)
  assert.match(community, /community\.notifications\(p\)/)
  assert.match(community, /setNotifList\(previous => p === 1 \? nextItems : \[\.\.\.previous, \.\.\.nextItems\]\)/)
  assert.match(community, /setNotifHasMore\(nextItems\.length >= 20\)/)
  assert.match(community, /通知加载失败/)
  assert.match(community, /loadNotifications\(notifPage \+ 1\)/)

  assert.match(community, /const loadBookmarks = async \(p = 1\) =>/)
  assert.match(community, /community\.bookmarks\(p\)/)
  assert.match(community, /setBookmarks\(previous => p === 1 \? nextItems : \[\.\.\.previous, \.\.\.nextItems\]\)/)
  assert.match(community, /setBookmarksHasMore\(nextItems\.length >= 20\)/)
  assert.match(community, /收藏加载失败/)
  assert.match(community, /loadBookmarks\(bookmarksPage \+ 1\)/)
})

test('community offers a direct keyboard-reachable entry to the current user timeline', () => {
  assert.match(community, /<button[^>]+onClick=\{\(\) => openUser\(user\.id\)\}[^>]*>我的主页<\/button>/)
})

test('community reporting is single-flight and global searches clear group state', () => {
  assert.match(community, /const \[reporting, setReporting\] = useState\(false\)/)
  assert.match(community, /const reportRequest = useRef\(0\)/)
  assert.match(community, /if \(!showReport \|\| reporting\) return/)
  assert.match(community, /const requestId = \+\+reportRequest\.current/)
  assert.match(community, /if \(requestId !== reportRequest\.current\) return/)
  assert.match(community, /const enterGlobalScope = \(\) => \{[\s\S]*?activeGroupRef\.current = null[\s\S]*?setSelectedGroup\(null\)/)
  assert.match(community, /const doSearch = async \(\) => \{[\s\S]*?enterGlobalScope\(\)[\s\S]*?loadPosts\(1, \{ search:/)
  assert.match(community, /onClick=\{\(\) => \{ enterGlobalScope\(\); setActiveTag\(tag\); loadPosts\(1, \{ tag \}\) \}\}/)
  assert.match(community, /await community\.feature\(postId, action\)[\s\S]{0,120}loadPosts\(1, feedScopeRef\.current\)/)
})

test('timeline reporting cannot cross users and labels name their controls', () => {
  assert.match(timeline, /const reportRequest = useRef\(0\)/)
  assert.match(timeline, /reportRequest\.current \+= 1[\s\S]{0,180}setShowReport\(null\)/)
  assert.match(timeline, /const requestId = \+\+reportRequest\.current/)
  assert.match(timeline, /if \(requestId !== reportRequest\.current\) return/)
  assert.match(timeline, /htmlFor="timeline-report-reason"/)
  assert.match(timeline, /id="timeline-report-reason"/)
  assert.match(timeline, /htmlFor="timeline-report-detail"/)
  assert.match(timeline, /id="timeline-report-detail"/)
})

test('platform admins get post moderation controls and read-all invalidates stale notification loads', () => {
  assert.match(community, /const isPlatformAdmin = user\.role === 'admin'/)
  assert.match(community, /const canModeratePosts = isAdmin \|\| isPlatformAdmin/)
  assert.match(community, /canModeratePosts && post\.moderation === 'pending'/)
  assert.match(community, /const markNotificationsRead = async \(\) => \{[\s\S]*?notifRequest\.current \+= 1/)
  assert.match(community, /setNotifList\(items => items\.map\(item => \(\{ \.\.\.item, is_read: true \}\)\)\)/)
  assert.match(community, /onClick=\{markNotificationsRead\}/)
})
