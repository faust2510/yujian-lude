import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..');
const serverRoot = path.resolve(srcRoot, '..');
const libraryPath = path.join(__dirname, 'vip-subscription.js');

test('VIP subscription rules build basic and pro snapshots and validate user input', async () => {
  assert.equal(existsSync(libraryPath), true, 'vip-subscription.js should exist');
  const {
    buildVipPlanSnapshot,
    normalizeVipSubscriptionRequest,
    normalizeVipSubscriptionReview,
  } = await import(pathToFileURL(libraryPath));

  assert.deepEqual(buildVipPlanSnapshot('basic', {
    name: '基础 VIP',
    price: 29,
    currency: 'CNY',
    period: 'month',
    duration_days: 30,
    available: true,
    payment_instructions: '请联系运营获取收款方式',
  }), {
    ok: true,
    value: {
      tier: 'basic',
      name: '基础 VIP',
      price: 29,
      amountMinor: 2900,
      currency: 'CNY',
      period: 'month',
      durationDays: 30,
    },
  });
  assert.deepEqual(buildVipPlanSnapshot('pro', {
    name: '进阶 VIP',
    price: 59,
    currency: 'CNY',
    period: 'month',
    duration_days: 30,
    available: true,
  }), {
    ok: true,
    value: {
      tier: 'pro',
      name: '进阶 VIP',
      price: 59,
      amountMinor: 5900,
      currency: 'CNY',
      period: 'month',
      durationDays: 30,
    },
  });
  assert.match(buildVipPlanSnapshot('basic', { available: false }).error, /暂未开放/);
  assert.match(buildVipPlanSnapshot('basic', {
    name: '基础 VIP',
    price: 29,
    currency: 'CNY',
    period: 'month',
    duration_days: 366,
    available: true,
  }).error, /配置不完整/);
  assert.match(buildVipPlanSnapshot('basic', {
    name: '基础 VIP',
    price: 0.001,
    currency: 'CNY',
    period: 'month',
    duration_days: 30,
    available: true,
  }).error, /配置不完整/);
  assert.match(buildVipPlanSnapshot('basic', {
    name: '基础 VIP',
    price: 29,
    currency: 'C',
    period: 'month',
    duration_days: 30,
    available: true,
  }).error, /配置不完整/);

  assert.deepEqual(normalizeVipSubscriptionRequest({
    tier: 'basic',
    paymentReference: ' 1234 ',
    applicantNote: ' 已转账 ',
  }), {
    ok: true,
    value: { tier: 'basic', paymentReference: '1234', applicantNote: '已转账' },
  });
  assert.match(normalizeVipSubscriptionRequest({ tier: 'basic', paymentReference: '12' }).error, /4/);
  assert.deepEqual(normalizeVipSubscriptionRequest({ tier: 'pro', paymentReference: '5678' }), {
    ok: true,
    value: { tier: 'pro', paymentReference: '5678', applicantNote: null },
  });
  assert.match(normalizeVipSubscriptionRequest({ tier: 'enterprise', paymentReference: '1234' }).error, /套餐/);

  assert.match(normalizeVipSubscriptionReview({ action: 'approve', note: '' }).error, /核款凭据/);
  assert.deepEqual(normalizeVipSubscriptionReview({
    action: 'approve',
    note: '',
    paymentConfirmationReference: ' TXN-20260714-000001 ',
  }), {
    ok: true,
    value: {
      state: 'approved',
      reviewNote: null,
      paymentConfirmationReference: 'TXN-20260714-000001',
    },
  });
  assert.match(normalizeVipSubscriptionReview({ action: 'reject', note: '' }).error, /原因/);
  assert.deepEqual(normalizeVipSubscriptionReview({ action: 'reject', note: '未查到款项' }), {
    ok: true,
    value: {
      state: 'rejected',
      reviewNote: '未查到款项',
      paymentConfirmationReference: null,
    },
  });
});

test('VIP subscription schema and routes expose an auditable request-review lifecycle', () => {
  const schema = readFileSync(path.join(serverRoot, 'db', 'schema.sql'), 'utf8');
  const vipRoutes = readFileSync(path.join(srcRoot, 'routes', 'vip.routes.js'), 'utf8');
  const adminRoutes = readFileSync(path.join(srcRoot, 'routes', 'admin.routes.js'), 'utf8');
  const migration = readFileSync(path.join(serverRoot, 'db', 'migrations', '0015_harden_vip_subscription_requests.sql'), 'utf8');
  const tierMigrationPath = path.join(serverRoot, 'db', 'migrations', '0026_add_vip_pro_tier.sql');
  assert.equal(existsSync(tierMigrationPath), true, '0026 VIP tier migration should exist');
  const tierMigration = readFileSync(tierMigrationPath, 'utf8');
  const rewards = readFileSync(path.join(__dirname, 'rewards.js'), 'utf8');

  assert.match(schema, /CREATE TABLE vip_subscription_requests/);
  assert.match(schema, /idx_vip_subscription_requests_one_pending/);
  assert.match(schema, /payment_confirmation_reference/);
  assert.match(schema, /idx_vip_subscription_requests_confirmation_reference/);
  assert.match(schema, /user_id\s+UUID NOT NULL REFERENCES users\(id\) ON DELETE RESTRICT/);
  assert.match(schema, /reviewed_by\s+UUID REFERENCES users\(id\) ON DELETE RESTRICT/);
  assert.match(schema, /vip_pro_until\s+TIMESTAMPTZ/);
  assert.match(schema, /tier\s+TEXT NOT NULL CHECK \(tier IN \('basic', 'pro'\)\)/);
  assert.match(migration, /UPDATE users\s+SET role = 'free'.*WHERE role = 'vip'/s);
  assert.match(tierMigration, /ADD COLUMN IF NOT EXISTS vip_pro_until TIMESTAMPTZ/);
  assert.match(tierMigration, /tier IN \('basic', 'pro'\)/);
  assert.match(tierMigration, /pricing\.vip_pro/);
  assert.match(vipRoutes, /router\.get\('\/vip\/subscriptions'/);
  assert.match(vipRoutes, /router\.post\('\/vip\/subscriptions'/);
  assert.match(vipRoutes, /router\.delete\('\/vip\/subscriptions\/:id'/);
  assert.match(vipRoutes, /\{ tier: 'pro', \.\.\.pro, perks:/);
  assert.doesNotMatch(vipRoutes, /\{ tier: 'pro', \.\.\.pro, available: false/);
  assert.doesNotMatch(vipRoutes, /reviewer\.email/);
  assert.match(adminRoutes, /router\.get\('\/vip-subscriptions'/);
  assert.match(adminRoutes, /router\.patch\('\/vip-subscriptions\/:id'/);
  assert.match(adminRoutes, /normalizeVipSubscriptionReview\([\s\S]*paymentConfirmationReference/);
  assert.match(adminRoutes, /grantVipTierDays\(db, subscription\.user_id, subscription\.tier, subscription\.duration_days\)/);
  assert.match(adminRoutes, /validateAdminActorStatus\(actor\.rows\[0\]\)/);
  assert.match(adminRoutes, /err\.code === '23505'/);
  assert.doesNotMatch(rewards, /role\s*=\s*CASE WHEN role IN/);
});
