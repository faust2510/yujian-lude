# Yujian Lude Ops And Account Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable operations console and account-security hardening layer for 遇见路得.

**Architecture:** Keep the existing Express routes and React page structure. Add small backend helpers for admin auditing and auth security, update schema for fresh installs, expose focused admin/auth APIs, and extend the existing Admin/Profile/Login pages rather than adding a new app shell.

**Tech Stack:** Node.js ESM, Express, PostgreSQL, React, Vite, Axios, Node built-in test runner.

---

### Task 1: Backend Security Helpers

**Files:**
- Create: `server/src/lib/auth-security.js`
- Create: `server/src/lib/auth-security.test.js`
- Modify: `server/src/auth.js`

- [x] **Step 1: Define token hashing and lockout behavior**

Add a helper module that exports `hashToken`, `createPublicToken`, `normalizeEmailKey`, `isLocked`, and lockout constants.

- [x] **Step 2: Test the helper behavior first**

Run:

```bash
node --test server/src/lib/auth-security.test.js
```

Expected before implementation: helper import fails or assertions fail. Expected after implementation: tests pass.

- [x] **Step 3: Expose current session token safely**

Export `currentSessionToken(req)` from `server/src/auth.js` so password changes can preserve the current session while revoking others.

### Task 2: Schema And Diagnostics

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/src/scripts/diagnose-schema.js`

- [x] **Step 1: Add operational tables**

Add `admin_audit_logs`, `login_attempts`, and `password_reset_tokens`.

- [x] **Step 2: Add session indexes**

Add indexes for `sessions(user_id)` and `sessions(expires_at)`.

- [x] **Step 3: Update schema diagnosis**

Require the new tables and columns in `diagnose:schema`.

### Task 3: Admin Backend APIs

**Files:**
- Create: `server/src/lib/admin-audit.js`
- Create: `server/src/lib/admin-audit.test.js`
- Modify: `server/src/routes/admin.routes.js`
- Modify: `server/src/routes/community.routes.js`
- Modify: `server/src/routes/pastor-cert.routes.js`

- [x] **Step 1: Add audit helper and tests**

Write tests for `auditDetail`, `isAllowedAdminRole`, and report action normalization. Implement the helper only after the test fails.

- [x] **Step 2: Expand admin stats and user filters**

`GET /api/admin/stats` returns operation counters and recent audit logs. `GET /api/admin/users` accepts `q`, `role`, `banned`, and `email_verified`.

- [x] **Step 3: Wire critical audit logs**

Log settings changes, endorsement reviews, user ban/role changes, report handling, post deletion, community-admin review, and pastor-cert review.

- [x] **Step 4: Tighten report action validation**

`PATCH /api/community/reports/:id` only accepts `resolve` or `dismiss`.

### Task 4: Account Security Backend APIs

**Files:**
- Modify: `server/src/routes/auth.routes.js`
- Modify: `server/src/scripts/verify-real-users-flow.js`

- [x] **Step 1: Add login lockout**

Failed login increments `login_attempts`; locked credentials return 429; successful login clears attempts.

- [x] **Step 2: Add forgot/reset password**

Add `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`. Store only token hashes and return `devToken` only when explicit local debugging is enabled.

- [x] **Step 3: Revoke old sessions after password changes**

Change password preserves current session and removes others. Reset password removes all sessions.

- [x] **Step 4: Extend real-user verification**

Add password reset and lockout checks to `verify-real-users`.

### Task 5: Frontend Admin Console

**Files:**
- Modify: `web/src/api/client.js`
- Modify: `web/src/pages/Admin.jsx`

- [x] **Step 1: Add API client methods**

Add admin methods for stats, users filters, ban, role, reports, community admin applications, pastor certification review, and post deletion.

- [x] **Step 2: Expand Admin tabs**

Implement tabs for overview, endorsements, users, reports, applications, audit, and settings.

- [x] **Step 3: Add visible loading/error states**

Each tab shows loading, empty, error, and success states.

### Task 6: Frontend Account Security

**Files:**
- Modify: `web/src/api/client.js`
- Modify: `web/src/contexts/AuthProvider.jsx`
- Modify: `web/src/pages/Login.jsx`
- Modify: `web/src/pages/Profile.jsx`
- Modify: `web/src/main.jsx`
- Create: `web/src/pages/VerifyEmail.jsx`
- Create: `web/src/pages/ResetPassword.jsx`

- [x] **Step 1: Add auth client methods**

Add send verify, verify email, forgot password, reset password, and logout all methods.

- [x] **Step 2: Add forgot/reset UI**

Add login-page forgot-password flow and `/reset-password` page.

- [x] **Step 3: Add email verification UI**

Add `/verify-email` page and profile/banner controls for resending verification.

- [x] **Step 4: Align password copy**

Change profile password hint to 8 characters.

### Task 7: Verification

**Files:**
- Generated: `web-dist`

- [x] **Step 1: Run targeted tests**

```bash
node --test server/src/lib/*.test.js
```

- [x] **Step 2: Run frontend checks**

```bash
npm run lint --prefix web
npm run build --prefix web
```

- [x] **Step 3: Run full release verification**

```bash
npm run verify:release --prefix server
```

- [x] **Step 4: Inspect git state**

```bash
git diff --check
git status --short
```
