# Course Reading And Exam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pure course check-in completion with a reading-first course flow and final exam.

**Architecture:** Reuse existing course tables. Unit reads are stored in `unit_attempts`; final exams are defined in a small backend library and stored in `course_exam_attempts`; the existing completion/reward transaction runs only after passing the final exam.

**Tech Stack:** Node/Express/PostgreSQL backend, React/Vite frontend, Node test runner.

---

### Task 1: Course Exam Library

**Files:**
- Create: `server/src/lib/course-exams.js`
- Create: `server/src/lib/course-exams.test.js`

- [x] Add course exam definitions keyed by course slug.
- [x] Expose `publicCourseExam(slug)`, `gradeCourseExam(slug, answers)`, and `courseExamAnswers(slug)`.
- [x] Test that public questions omit answers and grading passes only at the configured threshold.

### Task 2: Reading Materials And Migration

**Files:**
- Modify: `server/db/seed.sql`
- Create: `server/db/migrations/0003_course_reading_materials.sql`

- [x] Add original reading material to every existing course unit.
- [x] Add an idempotent migration to update existing local and production rows.

### Task 3: Backend Course Flow

**Files:**
- Modify: `server/src/routes/courses.routes.js`

- [x] Return latest exam state in course detail.
- [x] Require `readConfirmed: true` when marking a unit read.
- [x] Keep unit read progress separate from final completion.
- [x] Add final exam fetch and submit endpoints.
- [x] Complete and reward a course only when all units are read and the final exam is passed.

### Task 4: Frontend Course UX

**Files:**
- Modify: `web/src/api/client.js`
- Modify: `web/src/pages/Courses.jsx`

- [x] Add exam API methods.
- [x] Replace flat check-in rows with foldable course and unit panels.
- [x] Show reading material inside each unit.
- [x] Unlock and render the final exam after all units are read.
- [x] Refresh course progress after reads and exam submissions.

### Task 5: Verification Scripts

**Files:**
- Modify: `server/src/scripts/verify-mvp-flow.js`
- Modify: `server/src/scripts/verify-real-users-flow.js`

- [x] Replace pure unit check-in with read-confirmation calls.
- [x] Fetch final exam questions and submit known-correct answers.
- [x] Assert course completion after passing the exam.

### Task 6: Verification

- [x] Run `npm test --prefix server`.
- [x] Run `npm run build --prefix web`.
- [x] Apply migrations to the local preview database.
- [x] Run a local API smoke test for course read and exam.
- [x] Run `npm run verify:release --prefix server`.
