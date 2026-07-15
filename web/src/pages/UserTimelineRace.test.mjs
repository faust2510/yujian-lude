import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const timelinePath = fileURLToPath(new URL('./UserTimeline.jsx', import.meta.url))
const timeline = readFileSync(timelinePath, 'utf8')

const profileEffectStart = timeline.indexOf('  useEffect(() => {')
const loadPostsStart = timeline.indexOf('  const loadPosts = useCallback')
const postsEffectStart = timeline.indexOf('  useEffect(() => {', loadPostsStart)
const toggleFollowStart = timeline.indexOf('  const toggleFollow', postsEffectStart)
const toggleLikeStart = timeline.indexOf('  const toggleLike', toggleFollowStart)

const profileEffect = timeline.slice(profileEffectStart, loadPostsStart)
const loadPosts = timeline.slice(loadPostsStart, postsEffectStart)
const postsEffect = timeline.slice(postsEffectStart, toggleFollowStart)
const toggleFollow = timeline.slice(toggleFollowStart, toggleLikeStart)

test('stale profile responses cannot replace the profile for a newly selected user', () => {
  assert.match(timeline, /import \{[^}]*useRef[^}]*} from 'react'/)
  assert.match(timeline, /const profileRequest = useRef\(0\)/)
  assert.match(profileEffect, /const requestId = \+\+profileRequest\.current/)
  assert.match(profileEffect, /\.then\(r => \{\s*if \(requestId !== profileRequest\.current\) return/)
  assert.match(profileEffect, /\.catch\(e => \{\s*if \(requestId !== profileRequest\.current\) return/)
  assert.match(profileEffect, /return \(\) => \{[\s\S]{0,160}profileRequest\.current \+= 1/)
})

test('stale initial and pagination post responses cannot overwrite or append to the current user', () => {
  assert.match(timeline, /const postsRequest = useRef\(0\)/)
  assert.match(loadPosts, /const requestId = \+\+postsRequest\.current/)

  const responseGuard = loadPosts.indexOf('if (requestId !== postsRequest.current) return')
  assert.ok(responseGuard > loadPosts.indexOf('await community.userPosts'), 'posts response must be checked after it resolves')
  for (const setter of ['setPosts(', 'setPage(', 'setHasMore(']) {
    assert.ok(responseGuard < loadPosts.indexOf(setter), `${setter} must be guarded from stale responses`)
  }

  assert.match(loadPosts, /catch \(e\) \{\s*if \(requestId !== postsRequest\.current\) return/)
  assert.match(loadPosts, /finally \{\s*if \(requestId === postsRequest\.current\) setLoading\(false\)/)
  assert.match(postsEffect, /return \(\) => \{\s*postsRequest\.current \+= 1\s*}/)
})

test('switching users clears the previous profile, posts, and pagination state before loading', () => {
  assert.match(profileEffect, /setProfile\(null\)/)
  assert.match(profileEffect, /setFollowed\(false\)/)
  assert.match(profileEffect, /setProfileError\(''\)/)

  assert.match(postsEffect, /setPosts\(\[\]\)/)
  assert.match(postsEffect, /setPage\(1\)/)
  assert.match(postsEffect, /setHasMore\(true\)/)
  assert.match(postsEffect, /setError\(''\)/)
  assert.match(postsEffect, /setOpenComments\(new Set\(\)\)/)
  assert.ok(postsEffect.indexOf('setPosts([])') < postsEffect.indexOf('loadPosts(1)'), 'old posts must be cleared before loading the new user')
})

test('comment authors navigate to their community user timeline', () => {
  assert.match(timeline, /const openUser = \(authorId\) => \{\s*navigate\(`\/community\/user\/\$\{authorId\}`\)\s*}/)
  assert.match(timeline, /<PostComments[\s\S]{0,500}onOpenUser=\{openUser\}/)
})

test('stale follow mutations cannot update a newly selected user', () => {
  assert.match(timeline, /const followRequest = useRef\(0\)/)
  assert.match(profileEffect, /followRequest\.current \+= 1/)
  assert.match(toggleFollow, /const requestId = \+\+followRequest\.current/)
  assert.match(toggleFollow, /await community\.follow\(userId\)[\s\S]{0,200}requestId !== followRequest\.current/)
  assert.match(toggleFollow, /catch \(e\) \{\s*if \(requestId !== followRequest\.current\) return/)
})
