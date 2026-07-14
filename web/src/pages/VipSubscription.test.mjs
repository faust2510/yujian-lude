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
