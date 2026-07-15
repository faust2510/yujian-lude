import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('VIP plan resolution treats legacy active VIP as Basic and active Pro as Pro', async () => {
  const auth = await import('../auth.js');
  assert.equal(typeof auth.resolveVipPlan, 'function');

  const now = new Date('2026-07-16T00:00:00.000Z');
  assert.equal(auth.resolveVipPlan({ vip_until: null, vip_pro_until: null }, now), null);
  assert.equal(auth.resolveVipPlan({
    vip_until: '2026-08-16T00:00:00.000Z',
    vip_pro_until: null,
  }, now), 'basic');
  assert.equal(auth.resolveVipPlan({
    vip_until: '2026-08-16T00:00:00.000Z',
    vip_pro_until: '2026-07-20T00:00:00.000Z',
  }, now), 'pro');
  assert.equal(auth.resolveVipPlan({
    vip_until: '2026-08-16T00:00:00.000Z',
    vip_pro_until: '2026-07-15T00:00:00.000Z',
  }, now), 'basic');
});

test('registration, session, login, and me expose one consistent vip_plan contract', () => {
  const auth = readFileSync(path.join(srcRoot, 'auth.js'), 'utf8');
  const routes = readFileSync(path.join(srcRoot, 'routes', 'auth.routes.js'), 'utf8');

  assert.match(auth, /u\.vip_pro_until/);
  assert.match(auth, /row\.vip_plan = resolveVipPlan\(row\)/);
  assert.match(routes, /u\.vip_pro_until/);
  assert.match(routes, /vip_plan: null/);
  assert.match(routes, /vip_plan: resolveVipPlan\(u\)/);
  assert.match(routes, /vip_plan/);
});
