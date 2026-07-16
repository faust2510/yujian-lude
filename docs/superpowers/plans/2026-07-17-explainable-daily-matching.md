# Explainable Daily Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver daily, three-person, explainable opposite-sex match recommendations driven by a 30-question compatibility questionnaire and mutual dealbreakers.

**Architecture:** Extend the existing Express/PostgreSQL application in place. A pure matching library owns compatibility, explanations, and selection; a small persistence service snapshots one batch per user/day; existing intent and chat routes remain authoritative for mutual-match behavior.

**Tech Stack:** Node.js ESM, Express 4, PostgreSQL, React 19/Vite, Node test runner.

---

## File structure

- Create `server/db/migrations/0033_explainable_daily_matching.sql`: profile preferences, question/answer tables, daily snapshot tables, constraints, and question seed.
- Create `server/src/lib/matching-engine.js` and `matching-engine.test.js`: pure mutual eligibility, dealbreaker, weighted-score, reason, prompt, and deterministic-selection API.
- Create `server/src/lib/matching-questionnaire.js` and `matching-questionnaire.test.js`: fixed version-1 question metadata and submission validation.
- Create `server/src/lib/daily-matches.js` and `daily-matches.test.js`: transactional get-or-create daily batch service.
- Modify `server/src/routes/profile.routes.js`, `server/src/routes/match.routes.js`, `server/src/lib/match-gate.js`, and `server/src/lib/match-qualification.js`.
- Modify `server/db/schema.sql`, `server/db/seed.sql`, verification scripts, `web/src/api/client.js`, `web/src/pages/Profile.jsx`, and `web/src/pages/Match.jsx`.
- Create `server/src/routes/match.routes.test.js` and `web/src/pages/Match.test.mjs`.

## Task 1: Pure compatibility engine

**Files:** Create `server/src/lib/matching-engine.test.js`; create `server/src/lib/matching-engine.js`.

- [ ] Write failing tests proving: different genders plus reciprocal age/city checks are required; either user's incompatible dealbreaker excludes a pair; a compatible pair yields score, grade, three reasons, and one prompt; selection keeps at most three stable candidates.
- [ ] Run `npm test --prefix server -- src/lib/matching-engine.test.js` and confirm it fails because `matching-engine.js` does not exist.
- [ ] Implement exactly these exports:

```js
export function isMutuallyEligible(viewer, candidate) {}
export function hasMutualDealbreakerConflict(viewerAnswers, candidateAnswers, questions) {}
export function evaluateCompatibility({ viewer, candidate, questions }) {}
export function selectDailyRecommendations(candidates, limit = 3) {}
```

Use weights faith 30, marriage 25, family 15, children 12, finance 10, lifestyle 8; exclude scores below 50; map to the three approved Chinese grades.
- [ ] Re-run the focused suite; commit `feat: add explainable matching engine`.

## Task 2: Question definition and validation

**Files:** Create `server/src/lib/matching-questionnaire.test.js`; create `server/src/lib/matching-questionnaire.js`.

- [ ] Write failing tests proving a complete set of 30 known options and at most five dealbreakers is accepted; unknown options, missing questions, and six dealbreakers fail.
- [ ] Run `npm test --prefix server -- src/lib/matching-questionnaire.test.js` and confirm its missing-module failure.
- [ ] Implement `QUESTIONNAIRE_V1` with 30 single-choice questions across the approved dimensions. Every question must provide ID, dimension, prompt, 3--5 options, dealbreaker eligibility, label, and compatibility matrix. Export `questionnaireForApi` and `validateQuestionnaireSubmission`.
- [ ] Re-run the suite; commit `feat: define matching questionnaire`.

## Task 3: Database and profile preferences

**Files:** Create `server/db/migrations/0033_explainable_daily_matching.sql`; modify `server/db/schema.sql`, `server/db/seed.sql`, `server/src/routes/profile.routes.js`, and `server/src/routes/profile.routes.test.js`.

- [ ] Add a failing route-contract test that expects `gender`, `preferred_min_age`, `preferred_max_age`, and `preferred_city_mode` to be persisted by `PUT /me/profile`; run `npm test --prefix server -- src/routes/profile.routes.test.js` and confirm red.
- [ ] Add legacy-safe nullable profile columns with range/check constraints. Add version, question, option, response, batch, and recommendation tables with unique user/day and batch/candidate constraints. Add the seed matching the static version-1 metadata.
- [ ] Validate profile gender, reciprocal age range, and city mode. Preserve current completion semantics so old profiles can edit; require new fields only at the match gate.
- [ ] Update fresh schema/seed in lockstep; run the focused suite and a fresh migration; commit `feat: persist matching profiles and questionnaires`.

## Task 4: Daily batch service

**Files:** Create `server/src/lib/daily-matches.test.js`; create `server/src/lib/daily-matches.js`.

- [ ] Write failing tests for same user/date idempotency and fewer-than-three result behavior. Run `npm test --prefix server -- src/lib/daily-matches.test.js` and confirm red.
- [ ] Implement `getOrCreateDailyMatches({ userId, date, db })`: read existing batch; otherwise transactionally create one, query eligible users, load answers, invoke the pure engine, persist at most three results, and re-read on a unique conflict.
- [ ] Re-run the suite; commit `feat: snapshot daily match recommendations`.

## Task 5: Match APIs and gate

**Files:** Modify `server/src/routes/match.routes.js`, `server/src/lib/match-gate.js`, and `server/src/lib/match-qualification.js`; create `server/src/routes/match.routes.test.js`.

- [ ] Write failing tests for `GET /match/questionnaire`, `PUT /match/questionnaire`, `GET /match/recommendations/today`, and missing gender/questionnaire gate actions. Verify red with `npm test --prefix server -- src/routes/match.routes.test.js`.
- [ ] Implement the three endpoints. The today endpoint returns clear next actions until existing qualifications, gender, preferences, and questionnaire are complete; then delegates to the daily batch service.
- [ ] Preserve legacy `/match/candidates` but apply opposite-sex and preference filters. Update the daily snapshot item after like/pass; retain existing mutual-chat behavior.
- [ ] Re-run focused route and gate tests; commit `feat: expose daily matching APIs`.

## Task 6: Profile and daily recommendation UI

**Files:** Modify `web/src/api/client.js`, `web/src/pages/Profile.jsx`, and `web/src/pages/Match.jsx`; create `web/src/pages/Match.test.mjs`.

- [ ] Write failing source/component tests showing Profile collects sex, age bounds, city preference and Match calls `matches.today()` rather than `matches.candidates()`. Run `npm test --prefix web -- src/pages/Match.test.mjs` and confirm red.
- [ ] Add client methods for questionnaire and today results. Add Profile controls. Replace the legacy browser with a questionnaire completion flow plus up to three anonymous cards that show age band, city, faith background, grade, three reasons, one prompt, heart, and pass.
- [ ] Run the focused test, lint, and build. Commit `feat: add daily match experience`.

## Task 7: End-to-end verification

**Files:** Modify `server/src/scripts/verify-mvp-flow.js`, `server/src/scripts/verify-real-users-flow.js`, and `README.md`.

- [ ] Extend the real-user flow with complementary male/female profiles, complete questionnaires, and an incompatible dealbreaker fixture. Before implementation is complete, run it and confirm endpoint/assertion failure.
- [ ] Verify daily cap, same-day stability, hard-conflict exclusion, explanations, and existing mutual-chat behavior.
- [ ] Run `npm test --prefix server`; `npm run lint --prefix web && npm run build --prefix web && npm test --prefix web`; then `DATABASE_URL="$DATABASE_URL" npm run verify:release --prefix server`.
- [ ] Document the questionnaire prerequisite and daily recommendation behavior. Commit `test: verify explainable daily matching`.

## Plan self-review

- [x] Covers every approved requirement: opposite-sex matching, reciprocal filters, 30 questions, five dealbreakers, deterministic weights, three explanations plus prompt, max-three daily snapshot, gated disclosure, and current intent/chat reuse.
- [x] Excludes out-of-scope AI, vectors, scheduling, photos, pastor curation, notifications, and admin question editing.
- [x] Requires a failing test before every production module or route change.

