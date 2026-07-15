import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const api = read('api/client.js')
const community = read('pages/Community.jsx')

test('community admin application API forwards its payload', () => {
  assert.match(api, /adminApply:\s*\(data\)\s*=>\s*api\.post\('\/community\/admin-apply',\s*data\)/)
})

test('approved ordinary group members can submit a scoped admin application with feedback', () => {
  assert.match(community, /g\.my_membership_state\s*===\s*'approved'\s*&&\s*g\.my_role\s*===\s*'member'/)
  assert.match(community, /community\.adminApply\(\{\s*group_id:\s*\w+\.id,\s*reason:\s*adminApplicationReason\.trim\(\)\s*\}\)/s)
  assert.match(community, /disabled=\{adminApplicationBusy\s*\|\|\s*!adminApplicationReason\.trim\(\)\}/)
  assert.match(community, /adminApplicationFeedback/)
  assert.match(community, /setAdminApplicationFeedback\('申请已提交，等待平台审核。'\)/)
  assert.match(community, /const goToGroup = \(group\) => \{[\s\S]*setAdminApplicationReason\(''\)[\s\S]*setAdminApplicationFeedback\(''\)/)
  assert.match(community, /adminApplicationRequest/)
  assert.match(community, /requestId !== adminApplicationRequest\.current/)
  assert.match(community, /adminApplicationGroup\.current !== group\.id/)
})

test('only group owners can promote members', () => {
  assert.match(community, /g\.my_role\s*===\s*'owner'\s*&&\s*m\.role\s*===\s*'member'/)
})

test('group announcement composer posts an announcement and refreshes announcements', () => {
  assert.match(community, /activeTab\s*===\s*'announcements'\s*&&\s*isAdmin\s*&&\s*renderComposer\('announcement'\)/)
  assert.match(community, /if\s*\(postType\s*===\s*'announcement'\)\s*payload\.post_type\s*=\s*'announcement'/)
  assert.match(community, /postType\s*===\s*'announcement'\s*\?\s*'announcement'\s*:\s*undefined/)
  assert.match(community, /postType === 'announcement' \? '公告将直接发布' : '帖子将由组长审核后可见'/)
  assert.match(community, /postType === 'announcement' \? '发布公告' : '发布'/)
})
