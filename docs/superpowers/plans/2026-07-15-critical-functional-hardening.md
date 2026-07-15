# Critical Functional Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining critical and high-impact gaps that prevent safe registration, adult-only matching, deterministic reviews, and usable core frontend flows.

**Architecture:** Keep validation in small pure helpers, enforce invariants again in PostgreSQL, and serialize quota/state transitions inside the same transaction as their writes. Preserve the existing Express, React, and migration patterns and add focused regression tests before each behavior change.

**Tech Stack:** Node.js test runner, Express, PostgreSQL, React, Vite, Playwright.

---

### Task 1: Adult-only profile and match qualification

**Files:**
- Modify: `server/src/lib/profile-inputs.js`
- Modify: `server/src/lib/profile-inputs.test.js`
- Modify: `server/src/routes/profile.routes.js`
- Modify: `server/src/lib/match-qualification.js`
- Modify: `server/src/lib/match-qualification.test.js`
- Modify: `server/src/lib/match-gate.js`
- Modify: `server/src/routes/match.routes.js`
- Modify: `server/db/schema.sql`
- Create: `server/db/migrations/0022_harden_profile_birth_year.sql`

- [ ] Add failing tests proving blank years normalize to `null`, malformed or under-18 years are rejected, and an invalid year cannot satisfy match qualification.
- [ ] Run `node --test src/lib/profile-inputs.test.js src/lib/match-qualification.test.js` from `server/` and confirm the new assertions fail for the missing validation.
- [ ] Implement `normalizeBirthYear(value, now)` and use it before profile completion and persistence.
- [ ] Require an adult birth year in both the qualification helper and candidate SQL.
- [ ] Add fresh-schema and incremental-migration checks that clean invalid legacy years, lower completion, and reject invalid future writes.
- [ ] Re-run focused tests and the real PostgreSQL migration tests.

### Task 2: Atomic match intent quota

**Files:**
- Modify: `server/src/routes/match.routes.js`
- Create: `server/src/routes/match-intent-concurrency.routes.test.js`

- [ ] Add a concurrent regression test proving a free user's daily quota cannot be exceeded.
- [ ] Move quota counting behind a per-user transaction lock and keep count plus upsert in the same transaction.
- [ ] Verify focused and full server tests.

### Task 3: Authentication concurrency and identity payloads

**Files:**
- Modify: `server/src/routes/auth.routes.js`
- Create or modify focused tests under `server/src/routes/auth-*.test.js`

- [ ] Add failing tests for concurrent same-email registration, concurrent password-reset throttling, and nickname presence in register/login/me payloads.
- [ ] Convert unique-email races to deterministic `409`, serialize reset throttling, and return nickname consistently.
- [ ] Verify focused and full server tests.

### Task 4: Endorsement review state and points

**Files:**
- Modify: `server/src/routes/admin.routes.js`
- Modify: `server/src/lib/endorsement-review.js`
- Modify: `server/src/lib/endorsement-review.test.js`
- Create or modify focused admin route tests.

- [ ] Add failing tests proving only `pending` endorsements can transition and verification awards `points.endorsement_done` once.
- [ ] Lock the endorsement row, apply the transition and reward in one transaction, and return a conflict for repeat reviews.
- [ ] Reject non-integer values for integer-backed point settings.
- [ ] Verify focused and full server tests.

### Task 5: Frontend recovery and discoverability

**Files:**
- Modify focused files under `web/src/contexts`, `web/src/components`, `web/src/lib`, and `web/src/pages` without changing backend files.

- [ ] Add failing source/behavior tests for auth retry state, nickname display, AI and relationship entry points, reader retry, mobile chat mode, and VIP viewers.
- [ ] Implement the smallest UI changes that make each flow reachable and recoverable.
- [ ] Run `npm test`, `npm run lint`, and `npm run build` from `web/`.

### Task 6: Integrated verification

**Files:**
- Modify only defects found by verification.

- [ ] Run full frontend and server test suites.
- [ ] Run `npm run verify:release` from `server/` against the real PostgreSQL test environment.
- [ ] Use the local browser to smoke test registration, profile save, match gating, community visibility, course reading, chat, AI, and relationship confirmation at desktop and mobile widths.
- [ ] Run an independent spec and code-quality review, fix findings, and commit only source plus tests.
