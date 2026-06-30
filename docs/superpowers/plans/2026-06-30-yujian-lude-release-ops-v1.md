# Yujian Lude Release Ops V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production operations guardrails for 遇见路得 without changing user-facing product behavior.

**Architecture:** Keep the existing Express server and release verification script. Add small focused helpers for config validation, readiness checks, and versioned migrations; wire them into CLI scripts and release verification. Document server backup, deploy, quality check, and rollback steps under `ops/`.

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

Commit only the Release Ops v1 first-slice files.

### Task 4: Versioned Migration Runner

**Files:**
- Create: `server/src/lib/migrations.js`
- Create: `server/src/lib/migrations.test.js`
- Create: `server/src/scripts/migrate-up.js`
- Create: `server/db/migrations/0001_create_schema_migrations.sql`
- Modify: `server/db/schema.sql`
- Modify: `server/src/scripts/diagnose-schema.js`
- Modify: `server/src/scripts/verify-release.js`
- Modify: `server/package.json`

- [x] **Step 1: Write failing migration tests**

Cover filename parsing, checksum generation, duplicate version rejection, pending migration planning, checksum drift rejection, transaction recording, and advisory lock usage.

- [x] **Step 2: Implement migration helper**

Add `checksumSql`, `parseMigrationFile`, `sortMigrations`, `planMigrations`, `loadMigrationFiles`, `ensureMigrationsTable`, `listAppliedMigrations`, `applyMigration`, and `runMigrations`.

- [x] **Step 3: Add CLI**

Add `npm run migrate:up --prefix server` and `npm run migrate:up --prefix server -- --dry-run`.

- [x] **Step 4: Wire release verification**

After fresh schema diagnostics, run `migrate:up` and `migrate:up --dry-run` against the temporary release database.

### Task 5: Backup Deploy Rollback Runbook

**Files:**
- Create: `ops/deploy-runbook.md`
- Modify: `README.md`
- Modify: `server/.env.example`
- Modify: `.gitignore`

- [x] **Step 1: Document preflight**

Require local `npm run verify:release --prefix server` and a clean git status before deployment.

- [x] **Step 2: Document backup**

Add `pg_dump --format=custom`, commit manifest, and `web-dist` backup steps without storing secrets.

- [x] **Step 3: Document deploy**

Add fetch/reset, dependency install, frontend build, `migrate:up`, service restart, and `/api/ready` checks.

- [x] **Step 4: Document rollback**

Prefer code/build rollback first; restore database only when necessary after stopping writes and preserving the failure state.

### Task 6: Final Quality Gate

**Files:**
- All Release Ops v1 files

- [x] **Step 1: Run backend tests**

```bash
npm run test --prefix server
```

- [x] **Step 2: Run frontend checks**

```bash
npm run lint --prefix web
npm run build --prefix web
```

- [x] **Step 3: Run full release gate**

```bash
npm run verify:release --prefix server
git diff --check
```
