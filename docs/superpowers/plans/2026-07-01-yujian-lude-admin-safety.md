# Yujian Lude Admin Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend guardrails for high-risk admin operations so local testing cannot accidentally lock the platform or corrupt settings.

**Architecture:** Keep the existing admin route surface and React admin page. Add pure validation helpers for admin user actions and setting updates, wire them into the Express routes, and extend the real-user verification flow with negative admin cases.

**Tech Stack:** Node.js ESM, Express, PostgreSQL, Node built-in test runner, React/Vite unchanged.

---

### Task 1: Admin Action Guardrails

**Files:**
- Modify: `server/src/lib/admin-audit.js`
- Modify: `server/src/lib/admin-audit.test.js`
- Modify: `server/src/routes/admin.routes.js`

- [x] **Step 1: Write failing tests**

Add tests proving an admin cannot ban themselves, demote themselves, remove the last active admin, or act after their admin status is no longer active.

- [x] **Step 2: Implement validation helper**

Add a pure helper that receives actor id, target user, desired action, next role, and active admin count; it returns a Chinese error string or `null`.

- [x] **Step 3: Wire routes**

Use the helper inside `/admin/users/:id/ban` and `/admin/users/:id/role` before updating users or deleting sessions.

### Task 2: Settings Guardrails

**Files:**
- Modify: `server/src/settings.js`
- Create: `server/src/settings.test.js`
- Modify: `server/src/routes/admin.routes.js`

- [x] **Step 1: Write failing tests**

Add tests proving unknown setting keys are rejected, booleans stay booleans, numeric config objects require non-negative finite numbers, and `match.light_course_id` requires a UUID string.

- [x] **Step 2: Implement validation helper**

Expose `validateSettingUpdate(key, value)` from `settings.js`, using the existing defaults as the allowlist.

- [x] **Step 3: Wire route**

Reject invalid setting updates with HTTP 400 before calling `setSetting`.

### Task 3: Verification

**Files:**
- Modify: `server/src/scripts/verify-real-users-flow.js`

- [x] **Step 1: Add real-user negative checks**

Assert admin self-ban, self-demotion, unknown setting key, invalid setting shape, settings list shape, and valid UUID-string setting updates are covered by the real-user flow. Last-active-admin removal is covered by the pure route helper because non-self last-admin removal is unreachable after admin authentication.

- [x] **Step 2: Run quality gate**

Run backend tests, frontend lint/build, release verification, and `git diff --check`.
