# Community Permission Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate global and group community authority, prevent forged announcements and duplicate applications, and expose a usable group-admin application flow.

**Architecture:** Global authority is granted only by an approved application whose `group_id` is null. Group authority remains sourced from approved `community_memberships`; approving a group-scoped application atomically promotes that membership. PostgreSQL partial unique indexes enforce one pending application per user and scope.

**Tech Stack:** Node.js, Express, PostgreSQL migrations, React/Vite, Node test runner.

---

### Task 1: Harden Backend Authorization

**Files:**
- Create: `server/src/routes/community-permissions.routes.test.js`
- Modify: `server/src/routes/community.routes.js`

- [ ] **Step 1: Write failing route tests**

Cover these concrete contracts:

```js
assert.match(globalAdminSql, /group_id IS NULL/i)
assert.equal(forgedAnnouncement.status, 403)
assert.equal(nonMemberApplication.status, 403)
assert.match(groupApprovalSql, /UPDATE community_memberships/i)
assert.equal(nonOwnerPromotion.status, 403)
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd server && node --test src/routes/community-permissions.routes.test.js`

Expected: failures proving group applications currently grant global authority, announcements trust client input, and `promote` is rejected.

- [ ] **Step 3: Implement the minimum authorization changes**

Apply these rules in `community.routes.js`:

```js
// Global authority only.
WHERE user_id = $1 AND group_id IS NULL AND state = 'approved'

// Only normal posts and announcements use this endpoint.
if (!['post', 'announcement'].includes(postType)) return res.status(400).json(...)

// Group announcements require owner/admin membership; global announcements
// require a platform admin or approved global community admin.
```

Group applications must require an approved membership. Group approval must update the exact approved membership to role `admin` in the same transaction. `promote` must be accepted only when the actor is the group owner and the target is an approved member.

- [ ] **Step 4: Verify route tests pass**

Run: `cd server && node --test src/routes/community-permissions.routes.test.js`

Expected: all community permission tests pass with zero skipped tests.

### Task 2: Enforce Application Invariants

**Files:**
- Create: `server/db/migrations/0019_harden_community_admin_permissions.sql`
- Modify: `server/db/schema.sql`
- Modify: `server/src/scripts/diagnose-schema.js`
- Modify: `server/src/scripts/diagnose-schema.test.js`

- [ ] **Step 1: Write failing schema diagnosis tests**

Require both partial unique indexes:

```js
['community_admin_applications', ['user_id'], "state = 'pending' AND group_id IS NULL"]
['community_admin_applications', ['user_id', 'group_id'], "state = 'pending' AND group_id IS NOT NULL"]
```

- [ ] **Step 2: Verify the diagnosis test fails**

Run: `cd server && node --test src/scripts/diagnose-schema.test.js`

Expected: source contract fails because neither index is diagnosed yet.

- [ ] **Step 3: Add schema and migration invariants**

The migration must delete duplicate pending rows with `ROW_NUMBER()`, promote only existing approved member rows for approved group applications, and create the global and group partial unique indexes. The fresh schema must define the same indexes.

- [ ] **Step 4: Verify diagnosis and fresh migration behavior**

Run: `cd server && node --test src/scripts/diagnose-schema.test.js`

Expected: schema diagnosis tests pass; final release verification will exercise the migration against a fresh PostgreSQL database.

### Task 3: Complete the Frontend Contract

**Files:**
- Modify: `web/src/api/client.js`
- Modify: `web/src/pages/Community.jsx`
- Create: `web/src/pages/CommunityPermissions.test.mjs`

- [ ] **Step 1: Write a failing source-contract test**

Assert that `adminApply(data)` sends a payload, approved ordinary members can submit a group-scoped reason, only owners see `promote`, and the announcement composer sends `post_type: 'announcement'`.

- [ ] **Step 2: Verify the frontend test fails**

Run: `cd web && node --test src/pages/CommunityPermissions.test.mjs`

Expected: all four missing contracts fail.

- [ ] **Step 3: Implement the UI flow**

Reuse the existing community layout and button styles. Add a compact application form for approved non-admin group members, success/error feedback, owner-only promotion, and an admin-only composer in the announcement tab.

- [ ] **Step 4: Verify frontend tests, lint, and build**

Run:

```bash
cd web
npm test
npm run lint
npm run build -- --outDir /tmp/meet-ruth-community-build --emptyOutDir
```

Expected: tests and lint exit zero; Vite produces a non-empty build.

### Task 4: Integrated Verification

**Files:**
- Modify when required by the real-user contract: `server/src/scripts/verify-real-users-flow.js`

- [ ] **Step 1: Run all server and web tests**

Run: `cd server && npm test && cd ../web && npm test && npm run lint`

Expected: zero failures.

- [ ] **Step 2: Run release verification**

Run: `cd server && npm run verify:release`

Expected: fresh database migrations, MVP flow, real-user flow, SMTP checks, and production build all pass.

- [ ] **Step 3: Browser smoke test**

Verify the group member application form, owner-only promotion controls, group announcement publishing, and denial feedback for unauthorized actions at desktop and mobile widths.
