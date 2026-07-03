# AI And Relationship Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict local AI consultation and a complete station-reviewed relationship confirmation flow.

**Architecture:** Keep the existing Express/PostgreSQL/React structure. Add small backend helper modules for AI retrieval and relationship state transitions, wire them into existing routes, then expose simple React pages/actions.

**Tech Stack:** Node.js, Express, PostgreSQL migrations, React/Vite, Node test runner.

---

### Task 1: Strict AI Knowledge Helper

**Files:**
- Create: `server/src/lib/ai-knowledge.js`
- Create: `server/src/lib/ai-knowledge.test.js`
- Modify: `server/src/routes/ai.routes.js`

- [ ] Write failing tests for an in-scope marriage-boundary question and an out-of-scope medical/legal question.
- [ ] Implement local source chunks, keyword retrieval, `buildAiAnswer(question)`, and out-of-scope guardrails.
- [ ] Wire `ai.routes.js` to the helper and keep `ai_consultations` logging.
- [ ] Run `npm test --prefix server -- src/lib/ai-knowledge.test.js`.

### Task 2: Relationship State Helper And Migration

**Files:**
- Create: `server/src/lib/relationship-flow.js`
- Create: `server/src/lib/relationship-flow.test.js`
- Create: `server/db/migrations/0005_relationship_confirmation_flow.sql`
- Modify: `server/db/schema.sql`

- [ ] Write failing tests for request, mutual user confirmation, pastoral side approval, final confirmation, and ending.
- [ ] Add relationship enum states `relationship_requested` and `mutual_confirmed`.
- [ ] Add columns `confirmation_requested_by`, `confirmation_requested_at`, `user_a_confirmed`, `user_b_confirmed`, `user_a_confirmed_at`, `user_b_confirmed_at`, `ended_reason`.
- [ ] Implement pure state helpers that compute the next state without database access.
- [ ] Run focused relationship-flow tests.

### Task 3: Relationship Routes

**Files:**
- Modify: `server/src/routes/relationships.routes.js`
- Modify: `web/src/api/client.js`

- [ ] Update `POST /relationships/initiate` to create or return the existing active relationship.
- [ ] Add `POST /relationships/:id/request-confirmation` for participant confirmation with required course exam check.
- [ ] Keep `POST /relationships/:id/exam-confirm` as a compatibility alias for request-confirmation.
- [ ] Implement `POST /relationships/:id/pastor-approve` for `admin` or `pastor` with explicit side.
- [ ] Update ending to store `ended_reason`.
- [ ] Add API client methods.

### Task 4: Frontend Pages

**Files:**
- Create: `web/src/pages/AiConsult.jsx`
- Modify: `web/src/main.jsx`
- Modify: `web/src/components/AppLayout.jsx`
- Modify: `web/src/pages/Relationships.jsx`
- Modify: `web/src/index.css`

- [ ] Add `/app/ai` route and sidebar nav.
- [ ] Build AI ask/history UI with source chips and out-of-scope notice.
- [ ] Add relationship request/confirm/review/end actions to the relationship page.
- [ ] Keep mobile-safe layout and clear empty/error states.

### Task 5: Verification Scripts

**Files:**
- Modify: `server/src/scripts/verify-mvp-flow.js`
- Modify: `server/src/scripts/verify-real-users-flow.js`

- [ ] Add AI in-scope and out-of-scope assertions.
- [ ] Add relationship confirmation flow assertions from active relationship to `confirmed`.
- [ ] Ensure the relationship flow still rejects unauthorized users.

### Task 6: Release Verification

- [ ] Run `npm test --prefix server`.
- [ ] Run `npm run lint --prefix web`.
- [ ] Run `npm run build --prefix web`.
- [ ] Run `npm run verify:release --prefix server`.
- [ ] Commit and push after the release gate passes.
