# Meaning of Marriage Course Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind 《婚姻的意义》 course units to real course-worthy chapters instead of front matter.

**Architecture:** Add one focused distribution planner in `server/src/lib/textbook-bindings.js`. `bindTextbookToCourse` keeps the existing DB write path, but queries chapter titles/textbook slug and asks the planner for the bucket list.

**Tech Stack:** Node.js ESM, `node:test`, PostgreSQL via existing `db.query` interface.

## Global Constraints

- Keep generic textbook distribution unchanged for other books/courses.
- Do not commit EPUB source files.
- Preserve frontend `requiredReadings` API shape.
- Use TDD: failing test first, then minimal implementation.

---

### Task 1: Add Course-Specific Chapter Planner

**Files:**
- Modify: `server/src/lib/textbook-bindings.test.js`
- Modify: `server/src/lib/textbook-bindings.js`

**Interfaces:**
- Produces: `planCourseChapterDistribution({ courseSlug, textbookSlug, chapters, unitCount })`
- `chapters` rows must include `chapter_index` and `title`.
- Returns: `number[][]`, one bucket per course unit.

- [x] **Step 1: Write the failing test**

Add a test that passes the 16 imported TOC titles and expects:

```js
[[3, 4], [5], [6], [7], [8], [9], [10], [11], [12], [13]]
```

- [x] **Step 2: Run red test**

Run:

```bash
npm run test --prefix server -- src/lib/textbook-bindings.test.js
```

Expected: FAIL because `planCourseChapterDistribution` is not exported.

- [x] **Step 3: Implement minimal planner**

In `textbook-bindings.js`, add the course/textbook special case and otherwise call `distributeChapterIndexes`.

- [x] **Step 4: Wire DB rows to planner**

Update the chapter query to include `tc.title` and `t.slug AS textbook_slug`, then replace the direct generic distribution call with `planCourseChapterDistribution`.

- [x] **Step 5: Run green test**

Run:

```bash
npm run test --prefix server -- src/lib/textbook-bindings.test.js
```

Expected: PASS.

### Task 2: Re-import And Verify

**Files:**
- No code changes expected after Task 1.
- Local database rows in `course_unit_readings` will be rewritten by the importer.

**Interfaces:**
- Consumes: `npm run import:textbook --prefix server`.
- Produces: refreshed local course binding.

- [x] **Step 1: Run server tests**

```bash
npm run test --prefix server
```

- [x] **Step 2: Re-import local EPUB**

```bash
npm run import:textbook --prefix server -- --file /Users/qwe/Downloads/婚姻的意义.epub --slug meaning-of-marriage --course keller-meaning-of-marriage --license-note "用户本地提供的授权阅读教材"
```

- [x] **Step 3: Inspect binding rows**

Query the local DB through the existing environment and confirm the first readings are `引言` and `第1章 婚姻的奥秘`, not `扉页` or `目录`.

- [x] **Step 4: Run release gate**

```bash
npm run verify:release --prefix server
```

Expected: PASS.
