import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { redemptionCost, redeemableDays } from './vip-redemption.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vipSource = readFileSync(path.join(root, 'pages', 'Vip.jsx'), 'utf8')
const dashboardSource = readFileSync(path.join(root, 'pages', 'Dashboard.jsx'), 'utf8')

test('frontend redemption math follows server bundle settings', () => {
  assert.equal(redemptionCost(3, { points: 150, days: 2 }), 225)
  assert.equal(redeemableDays(200, { points: 150, days: 2 }), 2)
})

test('VIP redemption refreshes account state and avoids hardcoded ratios', () => {
  assert.match(vipSource, /const \{ user, refreshMe \} = useAuth\(\)/)
  assert.match(vipSource, /await Promise\.all\(\[points\.balance\(\), refreshMe\(\)\]\)/)
  assert.doesNotMatch(vipSource, /days \* 100/)
  assert.doesNotMatch(vipSource, /100 分 \/ 天/)
  assert.doesNotMatch(dashboardSource, /100 分 = 1 天 VIP 体验/)
  assert.doesNotMatch(dashboardSource, /签到 \+10/)
})
