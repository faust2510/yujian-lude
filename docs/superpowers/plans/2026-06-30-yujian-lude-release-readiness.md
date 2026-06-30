# Yujian Lude Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small, repeatable上线前体检 workflow for 遇见路得 without expanding product scope.

**Architecture:** Keep business code unchanged. Add Node-based operational scripts under `server/src/scripts`, expose them through `server/package.json`, and document the release-readiness workflow in README. The release script uses a temporary fresh PostgreSQL database and cleans it up after verification.

**Tech Stack:** Node.js ESM, Express, PostgreSQL via `pg`, React/Vite, npm scripts.

---

### Task 1: Schema Diagnosis Script

**Files:**
- Create: `server/src/scripts/diagnose-schema.js`
- Modify: `server/src/scripts/migrate.js`
- Modify: `server/package.json`

- [x] **Step 1: Add a read-only schema diagnostic script**

Create `server/src/scripts/diagnose-schema.js`. It should load `server/.env`, connect with `pg`, inspect `information_schema`, `pg_type`, and `pg_constraint`, print missing critical schema features, and exit 1 if any are missing.

- [x] **Step 1b: Keep schema diagnosis read-only**

Connect with `default_transaction_read_only=on` so future diagnostic edits cannot accidentally mutate the target database.

- [x] **Step 2: Add npm script**

Add this script to `server/package.json`:

```json
"diagnose:schema": "node src/scripts/diagnose-schema.js"
```

- [x] **Step 2b: Fix seed script semantics**

Update `server/src/scripts/migrate.js` so `npm run migrate --prefix server` runs schema + seed for a fresh DB, while `npm run seed --prefix server` runs only `seed.sql`.

- [x] **Step 3: Verify syntax**

Run:

```bash
node --check server/src/scripts/diagnose-schema.js
```

Expected: exit 0.

### Task 2: Release Verification Script

**Files:**
- Create: `server/src/scripts/verify-release.js`
- Modify: `server/package.json`

- [x] **Step 1: Add release verification orchestration**

Create `server/src/scripts/verify-release.js`. It should:

- Load `server/.env` without printing secrets.
- Derive a temporary database from `DATABASE_URL`.
- Run `npm run lint --prefix web`.
- Run `npm run build --prefix web`.
- Run `npm run test --prefix server`.
- Create the temporary database.
- Run `npm run migrate --prefix server` against the temporary database.
- Start `npm start --prefix server` on an isolated port.
- Probe `/api/health`, `/`, `/app`, and `/app/login`.
- Run `npm run verify:mvp --prefix server`.
- Run `npm run verify:real-users --prefix server`.
- Stop the server and drop the temporary database.
- Clean up on `SIGINT`, `SIGTERM`, uncaught exceptions, and unhandled promise rejections.

- [x] **Step 2: Add npm script**

Add this script to `server/package.json`:

```json
"verify:release": "node src/scripts/verify-release.js"
```

- [x] **Step 3: Verify syntax**

Run:

```bash
node --check server/src/scripts/verify-release.js
```

Expected: exit 0.

### Task 3: README Release-Readiness Documentation

**Files:**
- Modify: `README.md`
- Modify: `server/.env.example`

- [x] **Step 1: Update environment guidance**

Ensure README points users to `server/.env.example` before running local or deployment checks.

- [x] **Step 2: Document new scripts**

Add `diagnose:schema` and `verify:release` sections with exact commands and when to use them.

- [x] **Step 3: Add common failure notes**

Document the two common cases:

- old local DB schema drift should be checked with `diagnose:schema` or replaced by a fresh DB for verification;
- `verify:release` needs a PostgreSQL user that can create and drop temporary databases.

- [x] **Step 4: Keep secret wording precise**

State that `verify:release` itself does not actively print connection strings or secrets, while inherited child-process logs still need normal secret hygiene.

### Task 4: Full Verification

**Files:**
- Verify all touched files.

- [x] **Step 1: Run syntax checks**

Run:

```bash
node --check server/src/scripts/diagnose-schema.js
node --check server/src/scripts/verify-release.js
```

Expected: both exit 0.

- [x] **Step 2: Run frontend and backend checks**

Run:

```bash
npm run lint --prefix web
npm run build --prefix web
npm run test --prefix server
```

Expected: all exit 0.

- [x] **Step 3: Run full release verification**

Run:

```bash
npm run verify:release --prefix server
```

Expected: exits 0 and prints PASS for MVP and real-users verification.

- [x] **Step 4: Inspect git diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files are modified, plus unrelated `matcha` remains unstaged.
