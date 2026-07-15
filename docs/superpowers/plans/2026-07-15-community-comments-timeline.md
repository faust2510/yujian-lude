# Community Comments And Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make comment replies consistent and visible, restore the current user's timeline, and keep comment controls synchronized with server state.

**Architecture:** Comments use one explicit reply level. The route and a PostgreSQL trigger both require a reply's parent to be a root comment on the same post; legacy invalid links are preserved as root comments. Frontend thread state remains retryable and updates the owning post's authoritative comment count.

**Tech Stack:** Node.js, Express, PostgreSQL migrations/triggers, React/Vite, Node test runner.

---

### Task 1: Enforce Comment Parent Integrity

**Files:**
- Create: `server/src/routes/community-comments.routes.test.js`
- Modify: `server/src/routes/community.routes.js`
- Create: `server/db/migrations/0020_enforce_community_comment_parents.sql`
- Modify: `server/db/schema.sql`
- Modify: `server/src/scripts/diagnose-schema.js`
- Modify: `server/src/scripts/diagnose-schema.test.js`

- [x] Write route tests proving a cross-post parent and a reply-to-reply return 400 before insertion, while a same-post root reply succeeds and notifies the root author.
- [x] Run `cd server && node --test src/routes/community-comments.routes.test.js` and observe RED.
- [x] Validate and lock the parent inside the insert transaction, then use the parent author as the reply notification target.
- [x] Add a migration and fresh-schema trigger that enforce same-post root parents for every database writer; detach invalid legacy links to roots before enabling the trigger.
- [x] Add trigger diagnosis and a PostgreSQL integration test, then rerun the route and diagnosis tests to GREEN.

### Task 2: Render And Synchronize Comment Threads

**Files:**
- Modify: `web/src/pages/Community.jsx`
- Modify: `web/src/pages/UserTimeline.jsx`
- Modify when shared code reduces duplication: `web/src/components/community/PostComments.jsx`
- Modify: `web/src/index.css`
- Create: `web/src/pages/CommunityCommentsTimeline.test.mjs`

- [x] Write failing source-contract tests for rendering `comment.replies`, retrying a failed load, refreshing `comment_count` after add/delete, hiding social controls on pending posts, and opening comments from user timelines.
- [x] Run `cd web && node --test src/pages/CommunityCommentsTimeline.test.mjs` and observe RED.
- [x] Implement the smallest shared thread UI or state helper that satisfies both community and timeline screens without adding dependencies.
- [x] Remove the current-user empty-page branch, load the same public profile/posts for self, and hide only the self-follow action.
- [x] Run the targeted test, all web tests, lint, and a temporary production build.

### Task 3: Real User And Release Verification

**Files:**
- Modify: `server/src/scripts/verify-real-users-flow.js`

- [x] Extend the community flow with a root comment and reply from different users; assert the reply is returned under `root.replies` and counts are accurate.
- [x] Run the PostgreSQL migration integration test with `TEST_DATABASE_URL`.
- [x] Run `cd server && npm run verify:release` and require fresh DB, all 20 migrations, MVP, real users, and production SMTP to pass.
- [x] Browser-smoke the global community and self/other timelines at desktop and mobile widths.
