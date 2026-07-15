import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const community = read('pages/Community.jsx')
const timeline = read('pages/UserTimeline.jsx')
const commentsPath = path.join(root, 'components/community/PostComments.jsx')

test('comment thread renders root comments with one-level replies and root-only reply controls', () => {
  assert.equal(existsSync(commentsPath), true, 'shared comment thread component should exist')
  const comments = read('components/community/PostComments.jsx')

  assert.match(comments, /comments\?\.map\(comment\s*=>/)
  assert.match(comments, /\(comment\.replies\s*\?\?\s*\[\]\)\.map\(reply\s*=>/)
  assert.match(comments, /setReplyTo\(\{\s*id:\s*comment\.id,\s*nickname:\s*comment\.author_nickname\s*}\)/s)
  assert.doesNotMatch(comments, /reply\.replies/)
})

test('failed comment loads remain retryable instead of becoming cached empty results', () => {
  assert.equal(existsSync(commentsPath), true, 'shared comment thread component should exist')
  const comments = read('components/community/PostComments.jsx')

  assert.match(comments, /const \[comments, setComments\] = useState\(null\)/)
  assert.match(comments, /catch \(error\) \{[\s\S]{0,160}setLoadError\(/)
  assert.match(comments, /onClick=\{loadComments\}>重试<\/button>/)
  assert.doesNotMatch(comments, /catch \(error\) \{[\s\S]{0,160}setComments\(\[\]\)/)
  assert.match(comments, /const loadRequest = useRef\(0\)/)
  assert.match(comments, /requestId !== loadRequest\.current/)
  assert.match(comments, /return \(\) => \{[\s\S]{0,160}loadRequest\.current \+= 1/)
})

test('unmounted comment mutations cannot restart loading or publish stale state', () => {
  const comments = read('components/community/PostComments.jsx')

  assert.match(comments, /const mutationRequest = useRef\(0\)/)
  assert.match(comments, /mutationRequest\.current \+= 1/)
  assert.match(comments, /await community\.addComment\(postId, payload\)[\s\S]{0,240}requestId !== mutationRequest\.current/)
  assert.match(comments, /await community\.deleteComment\(commentId\)[\s\S]{0,240}requestId !== mutationRequest\.current/)
  assert.match(comments, /if \(!mounted\.current\) return/)
})

test('comment composer respects IME composition and author links are keyboard reachable', () => {
  const comments = read('components/community/PostComments.jsx')

  assert.match(comments, /event\.nativeEvent\.isComposing/)
  assert.match(comments, /<button[^>]*className="com-comment-author"/)
  assert.doesNotMatch(comments, /<span className="com-comment-author"/)
})

test('comment refresh uses returned total to synchronize each post count after mutations', () => {
  assert.equal(existsSync(commentsPath), true, 'shared comment thread component should exist')
  const comments = read('components/community/PostComments.jsx')

  assert.match(comments, /onTotalChange\?\.\(postId, response\.data\.total\s*\?\?\s*0\)/)
  assert.match(comments, /await community\.addComment\(postId, payload\)[\s\S]{0,400}await loadComments\(\)/)
  assert.match(comments, /await community\.deleteComment\(commentId\)[\s\S]{0,400}await loadComments\(\)/)
  assert.match(community, /const updateCommentCount = useCallback\(\(postId, total\) =>/)
  assert.match(timeline, /const updateCommentCount = useCallback\(\(postId, total\) =>/)
})

test('approved feeds without moderation remain interactive while pending posts stay locked', () => {
  assert.match(community, /const canInteract = post\.moderation !== 'pending'/)
  assert.match(community, /\{canInteract && \(\s*<>[\s\S]{0,1600}toggleLike\(post\.id\)[\s\S]{0,1600}toggleBookmark\(post\.id\)/)
  assert.match(community, /\(user\.id === post\.author_id \|\| canModeratePosts\) && \(/)
  assert.match(community, /canModeratePosts && post\.moderation === 'pending'/)
})

test('self timeline still fetches profile and posts, while hiding only the self-follow action', () => {
  assert.match(timeline, /const isSelf = userId === currentUserId/)
  assert.match(timeline, /community\.userProfile\(userId\)/)
  assert.doesNotMatch(timeline, /if \(!userId \|\| userId === currentUserId\) return/)
  assert.doesNotMatch(timeline, /if \(userId === currentUserId\) \{\s*return/s)
  assert.match(timeline, /isSelf && <span[^>]*>这是你的主页<\/span>/)
  assert.match(timeline, /!isSelf && \(\s*<button/s)
})

test('timeline comment controls open the shared interactive thread', () => {
  assert.doesNotMatch(timeline, /const canInteract = post\.moderation === 'approved'/)
  assert.match(timeline, /const \[openComments, setOpenComments\] = useState\(new Set\(\)\)/)
  assert.match(timeline, /onClick=\{\(\) => toggleComments\(post\.id\)\}/)
  assert.match(timeline, /<PostComments[\s\S]{0,500}postId=\{post\.id\}/)
})
