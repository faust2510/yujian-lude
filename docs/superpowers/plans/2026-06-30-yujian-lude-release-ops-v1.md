# Yujian Lude Release Ops V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production operations guardrails for 遇见路得 without changing user-facing product behavior.

**Architecture:** Keep the existing Express server and release verification script. Add small focused helpers for config validation and readiness checks, wire them into `server/src/index.js`, and extend `verify:release` to probe the new endpoints. Later tasks will add versioned migrations and deployment runbooks.

**Tech Stack:** Node.js ESM, Express, PostgreSQL, React/Vite, Node built-in test runner.

---

### Task 1: Production Config Guardrails

**Files:**
- Modify: `server/src/config.js`
- Create: `server/src/config.test.js`
- Modify: `server/package.json`

- [x] **Step 1: Write config tests**

Add tests that assert:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConfig, validateConfig } from './config.js';

test('production rejects development defaults', () => {
  const config = buildConfig({
    NODE_ENV: 'production',
    DATABASE_URL: '',
    SESSION_SECRET: 'dev-insecure-secret',
    COOKIE_SECURE: 'false',
  });

  assert.throws(() => validateConfig(config), /DATABASE_URL/);
});
```

- [x] **Step 2: Run tests and confirm red**

Run:

```bash
npm run test --prefix server
```

Expected before implementation: fails because `buildConfig` and `validateConfig` do not exist.

- [x] **Step 3: Implement config builder and validation**

Export `buildConfig(env)` and `validateConfig(config)`. Production rules:

- `DATABASE_URL` must be explicitly set and must not be the development default.
- `SESSION_SECRET` must be explicitly set, must not equal `dev-insecure-secret`, and must be at least 32 characters.
- `COOKIE_SECURE` must be true.
- `EXPOSE_DEV_TOKENS` must be false.

- [x] **Step 4: Run tests and confirm green**

Run:

```bash
npm run test --prefix server
```

Expected: all server tests pass.

### Task 2: Live And Ready Endpoints

**Files:**
- Create: `server/src/lib/readiness.js`
- Create: `server/src/lib/readiness.test.js`
- Modify: `server/src/index.js`
- Modify: `server/src/scripts/verify-release.js`

- [x] **Step 1: Write readiness tests**

Add tests for `formatReadiness`, including passing and failing checks without exposing secret values.

- [x] **Step 2: Implement readiness helper**

Create a helper that receives check results and returns `{ ok, checks }`.

- [x] **Step 3: Wire endpoints**

Add:

```txt
GET /api/live
GET /api/ready
```

`/api/ready` checks database query, required key tables, and `web-dist/index.html`.

- [x] **Step 4: Extend release verification**

Probe `/api/live` and `/api/ready` in addition to `/api/health`.

### Task 3: Verification And Commit

**Files:**
- Generated: `web-dist` if build output changes

- [x] **Step 1: Run syntax and tests**

```bash
node --check server/src/config.js
node --check server/src/index.js
node --check server/src/lib/readiness.js
npm run test --prefix server
```

- [x] **Step 2: Run frontend and release checks**

```bash
npm run lint --prefix web
npm run build --prefix web
npm run verify:release --prefix server
git diff --check
```

- [x] **Step 3: Commit and push**

Commit only the Release Ops v1 first-slice files and leave unrelated `matcha` changes alone.
