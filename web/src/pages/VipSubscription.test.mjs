import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const api = read('api/client.js')
const vip = read('pages/Vip.jsx')
const admin = read('pages/Admin.jsx')

test('VIP page submits and displays a real manual-payment subscription request', () => {
  assert.match(api, /subscriptions:\s*\(\) => api\.get\('\/vip\/subscriptions'\)/)
  assert.match(api, /subscribe:\s*\(data\) => api\.post\('\/vip\/subscriptions', data\)/)
  assert.match(api, /cancelSubscription:/)
  assert.match(vip, /付款流水尾号/)
  assert.match(vip, /提交核款申请/)
  assert.match(vip, /vipApi\.subscribe/)
  assert.match(vip, /formatCurrencyAmount/)
  assert.doesNotMatch(vip, />¥\{/)
  assert.doesNotMatch(vip, /付费渠道建设中/)
})

test('VIP page offers both tiers and submits the selected tier', () => {
  assert.match(vip, /const \[selectedTier, setSelectedTier\] = useState\('basic'\)/)
  assert.match(vip, /plans\.map\(plan =>/)
  assert.match(vip, /tier: selectedTier/)
  assert.match(vip, /基础 VIP/)
  assert.match(vip, /进阶 VIP/)
  assert.match(vip, /积分兑换与课程赠送均为 Basic/)
  assert.doesNotMatch(vip, /进阶套餐暂未开放/)
})

test('VIP page renders the active plan and Pro expiry returned by auth me', () => {
  assert.match(vip, /user\?\.vip_plan/)
  assert.match(vip, /user\.vip_pro_until/)
  assert.match(vip, /Pro/)
  assert.match(vip, /Basic/)
})

test('VIP page refreshes subscriptions and current user together on window focus', () => {
  assert.match(vip, /Promise\.all\(\[vipApi\.subscriptions\(\), refreshMe\(\)\]\)/)
  assert.match(vip, /setSubscriptions\(subscriptionsResult\.data\.subscriptions \|\| \[\]\)/)
  assert.match(vip, /window\.addEventListener\('focus', refreshVipState\)/)
  assert.match(vip, /window\.removeEventListener\('focus', refreshVipState\)/)
})

test('admin console exposes VIP request review and does not assign VIP as a role', () => {
  assert.match(api, /vipSubscriptions:/)
  assert.match(api, /reviewVipSubscription:/)
  assert.match(admin, /\['vip-subscriptions', 'VIP申请'\]/)
  assert.match(admin, /function VipSubscriptionsTab/)
  assert.match(admin, /完整核款凭据/)
  assert.match(admin, /formatCurrencyAmount/)
  assert.doesNotMatch(admin, /¥\{\(item\.amount_minor/)
  assert.match(api, /payment_confirmation_reference:/)
  assert.doesNotMatch(admin, /<option value="vip">vip<\/option><option value="pastor">/)
})

test('admin console identifies the requested Basic or Pro tier', () => {
  assert.match(admin, /item\.tier === 'pro'/)
  assert.match(admin, /进阶 VIP/)
  assert.match(admin, /基础 VIP/)
})
