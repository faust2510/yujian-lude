# Textbook Reading System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first full教材阅读 system for 遇见路得 so logged-in users can read《婚姻的意义》by chapter, record progress, and unlock course unit check-ins only after required textbook chapters are read.

**Architecture:** Add normalized textbook tables, an EPUB importer, authenticated textbook APIs, and React reader pages. Keep existing course/exam behavior intact, but extend course detail and unit submit to include required textbook readings.

**Tech Stack:** Node.js ESM, Express, PostgreSQL, `node:test`, React 19, React Router, Axios, Vite.

## Global Constraints

- Product anchors remain `遇见路得`, `/app`, and `/api/*`.
- Do not commit `/Users/qwe/Downloads/婚姻的意义.epub` or any copied EPUB file.
- Do not place EPUB source files or extracted full-book assets in public static directories or `web-dist`.
- Reader chapter APIs must require login.
- APIs must return chapter-by-chapter content only; no whole-book download endpoint.
- Import scripts must not print chapter body text to terminal output.
- Existing course material remains as original guide/reflection material.
- Existing course exam logic remains unchanged except that required textbook reading can block unit submit.
- Use additive migrations; do not rewrite old applied migrations.
- New browser UI must fit at 390px width without horizontal overflow.

---

## File Structure

- Create `server/db/migrations/0009_textbook_reading_system.sql`: additive database tables and indexes.
- Modify `server/db/schema.sql`: fresh-install schema parity for the same textbook tables.
- Modify `server/src/scripts/diagnose-schema.js`: require new tables, columns, and unique indexes.
- Create `server/src/lib/textbook-html.js`: sanitize imported chapter HTML and derive plain text/word count.
- Create `server/src/lib/textbook-epub.js`: parse EPUB container/OPF/NCX, extract ordered chapters, and return sanitized chapter objects.
- Create `server/src/lib/textbook-bindings.js`: distribute imported textbook chapters across course units.
- Create `server/src/lib/textbook-reading.js`: shared DB helpers for textbook lists, detail, chapter read status, and course unit reading gates.
- Create `server/src/routes/textbooks.routes.js`: authenticated textbook API routes.
- Modify `server/src/routes/courses.routes.js`: include unit `readings` and block unit submit if required readings are incomplete.
- Modify `server/src/index.js`: mount textbook routes under `/api`.
- Create `server/src/scripts/import-textbook.js`: CLI importer for local EPUB files.
- Modify `server/package.json`: add `import:textbook` script.
- Create `server/src/lib/textbook-html.test.js`: sanitizer tests.
- Create `server/src/lib/textbook-epub.test.js`: minimal EPUB fixture parser test.
- Create `server/src/lib/textbook-reading.test.js`: pure helper tests for reading gate behavior.
- Create `server/src/routes/textbooks.routes.test.js`: route-level tests for auth and shape.
- Modify `server/src/lib/legacy-schema-migration.test.js`: require migration SQL to include textbook tables.
- Modify `server/src/scripts/diagnose-schema.test.js`: require diagnostics to include textbook tables.
- Modify `web/src/api/client.js`: add `textbooks` API client.
- Modify `web/src/main.jsx`: add protected textbook routes.
- Modify `web/src/components/AppLayout.jsx`: add sidebar link for 教材.
- Create `web/src/pages/Textbooks.jsx`: textbook library and table of contents page.
- Create `web/src/pages/TextbookReader.jsx`: chapter reader page.
- Modify `web/src/pages/Courses.jsx`: show bound textbook readings and disable/guide unit read button until complete.
- Modify `web/src/index.css`: reader and course reading styles.
- Create `web/src/pages/Textbooks.test.mjs`: API-rendering and reader state tests.
- Modify `web/src/pages/Courses*.test.mjs` only if an existing course test appears after implementation; otherwise create `web/src/pages/CoursesTextbookReadings.test.mjs`.

## Interfaces

### Database Tables

```sql
CREATE TABLE IF NOT EXISTS textbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_image TEXT,
  source_filename TEXT,
  license_note TEXT,
  visibility TEXT NOT NULL DEFAULT 'login_required',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS textbook_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  source_href TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (textbook_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS textbook_reading_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES textbook_chapters(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS course_unit_readings (
  course_unit_id UUID NOT NULL REFERENCES course_units(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES textbook_chapters(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course_unit_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_textbook_chapters_textbook ON textbook_chapters(textbook_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_textbook_progress_user ON textbook_reading_progress(user_id, completed, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_unit_readings_unit ON course_unit_readings(course_unit_id, sort_order);
```

### Backend Helper Signatures

```js
// server/src/lib/textbook-html.js
export function sanitizeChapterHtml(html) {}
export function htmlToText(html) {}
export function countWords(text) {}

// server/src/lib/textbook-epub.js
export async function parseEpub(filePath) {}

// server/src/lib/textbook-bindings.js
export function distributeChapterIndexes(chapterCount, unitCount) {}
export async function bindTextbookToCourse(db, { textbookId, courseSlug }) {}

// server/src/lib/textbook-reading.js
export async function listTextbooksForUser(db, userId) {}
export async function getTextbookDetailForUser(db, { slug, userId }) {}
export async function getChapterForUser(db, { slug, chapterIndex, userId }) {}
export async function markChapterRead(db, { slug, chapterIndex, userId }) {}
export async function readingsForCourseUnits(db, { courseId, userId }) {}
export async function incompleteRequiredReadings(db, { unitId, userId }) {}
```

### API Shapes

```json
{
  "textbooks": [
    {
      "slug": "meaning-of-marriage",
      "title": "婚姻的意义",
      "author": "Timothy Keller",
      "chapter_count": 12,
      "completed_count": 1,
      "progress_percent": 8
    }
  ]
}
```

```json
{
  "chapter": {
    "title": "第 1 章",
    "body_html": "<h2>...</h2><p>...</p>",
    "completed": false,
    "prev": null,
    "next": { "index": 2, "title": "第 2 章" }
  }
}
```

```json
{
  "readings": [
    {
      "textbook_slug": "meaning-of-marriage",
      "textbook_title": "婚姻的意义",
      "chapter_index": 1,
      "chapter_title": "第 1 章",
      "required": true,
      "completed": false
    }
  ]
}
```

## Task 1: Schema And Diagnostics

**Files:**
- Create: `server/db/migrations/0009_textbook_reading_system.sql`
- Modify: `server/db/schema.sql`
- Modify: `server/src/scripts/diagnose-schema.js`
- Modify: `server/src/lib/legacy-schema-migration.test.js`
- Modify: `server/src/scripts/diagnose-schema.test.js`

**Interfaces:**
- Produces the four tables and indexes listed in `Database Tables`.
- Produces diagnostics requiring `textbooks`, `textbook_chapters`, `textbook_reading_progress`, and `course_unit_readings`.

- [ ] **Step 1: Write failing tests**

Add assertions that migration SQL contains all four table names, the two primary composite keys, and the `UNIQUE (textbook_id, chapter_index)` constraint.

Run:

```bash
npm run test --prefix server -- server/src/lib/legacy-schema-migration.test.js server/src/scripts/diagnose-schema.test.js
```

Expected: FAIL until the migration and diagnostic lists are updated.

- [ ] **Step 2: Add migration and schema parity**

Add the SQL from `Database Tables` to the migration. Add equivalent fresh-install table definitions to `server/db/schema.sql` after `unit_attempts`, because textbooks extend the course domain.

- [ ] **Step 3: Update diagnostics**

Add these entries:

```js
const requiredTables = [
  // existing entries...
  'textbooks',
  'textbook_chapters',
  'textbook_reading_progress',
  'course_unit_readings',
];

const requiredColumns = [
  // existing entries...
  ['textbooks', ['slug', 'title', 'visibility', 'source_filename', 'license_note']],
  ['textbook_chapters', ['textbook_id', 'chapter_index', 'title', 'body_html', 'body_text', 'word_count']],
  ['textbook_reading_progress', ['user_id', 'chapter_id', 'completed', 'completed_at', 'last_read_at']],
  ['course_unit_readings', ['course_unit_id', 'chapter_id', 'required', 'sort_order']],
];

const requiredUniqueIndexes = [
  // existing entries...
  ['textbooks', ['slug']],
  ['textbook_chapters', ['textbook_id', 'chapter_index']],
  ['textbook_reading_progress', ['user_id', 'chapter_id']],
  ['course_unit_readings', ['course_unit_id', 'chapter_id']],
];
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test --prefix server -- server/src/lib/legacy-schema-migration.test.js server/src/scripts/diagnose-schema.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0009_textbook_reading_system.sql server/db/schema.sql server/src/scripts/diagnose-schema.js server/src/lib/legacy-schema-migration.test.js server/src/scripts/diagnose-schema.test.js
git commit -m "Add textbook reading schema"
```

## Task 2: EPUB Import Core

**Files:**
- Create: `server/src/lib/textbook-html.js`
- Create: `server/src/lib/textbook-epub.js`
- Create: `server/src/lib/textbook-bindings.js`
- Create: `server/src/lib/textbook-html.test.js`
- Create: `server/src/lib/textbook-epub.test.js`
- Modify: `server/package.json`
- Create: `server/src/scripts/import-textbook.js`

**Interfaces:**
- Consumes database tables from Task 1.
- Produces `parseEpub(filePath)`, `sanitizeChapterHtml(html)`, `distributeChapterIndexes(chapterCount, unitCount)`, and CLI `npm run import:textbook --prefix server -- --file ... --slug ... --course ...`.

- [ ] **Step 1: Write sanitizer tests**

Test that `sanitizeChapterHtml('<h1 onclick="x()">Hi</h1><script>x()</script><p>A <em>B</em></p>')` returns HTML containing `<h1>Hi</h1>` and `<p>A <em>B</em></p>`, and not containing `script`, `onclick`, or `javascript:`.

- [ ] **Step 2: Implement sanitizer**

Use conservative regex-based cleanup because imported EPUB HTML is local trusted book input but still must not render scripts. Preserve only `h1`-`h6`, `p`, `br`, `strong`, `em`, `b`, `i`, `ul`, `ol`, `li`, `blockquote`, `a`, `sup`, `sub`, `hr`, `span`.

- [ ] **Step 3: Write EPUB fixture test**

Create the test fixture dynamically inside the test temp directory using `node:zlib` is not enough for ZIP creation. Instead, use an existing local ZIP-capable command from the test through `node:child_process` only if `/usr/bin/zip` exists; otherwise skip with `test.skip('zip command unavailable')`. The fixture must include `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, and two XHTML chapter files.

Assert:

```js
assert.equal(book.title, 'Fixture Book');
assert.equal(book.chapters.length, 2);
assert.equal(book.chapters[0].chapterIndex, 1);
assert.equal(book.chapters[0].title, 'Chapter One');
assert.doesNotMatch(book.chapters[0].bodyHtml, /script|onclick/i);
```

- [ ] **Step 4: Implement EPUB parser**

Parse the EPUB using `unzip -p` and `zipinfo -1` child processes to avoid adding a dependency. Read `META-INF/container.xml`, resolve OPF path, parse manifest/spine/metadata with small XML helper functions, prefer NCX titles, and return:

```js
{
  title,
  author,
  description,
  chapters: [
    { chapterIndex, title, bodyHtml, bodyText, sourceHref, wordCount }
  ]
}
```

- [ ] **Step 5: Implement binding helper**

`distributeChapterIndexes(chapterCount, unitCount)` returns an array with one entry per unit. For 12 chapters and 10 units it returns `[[1,2],[3],[4],[5],[6],[7],[8],[9],[10],[11,12]]`. For fewer chapters than units, later units get empty arrays and do not create bindings.

- [ ] **Step 6: Implement CLI importer**

CLI behavior:

```bash
npm run import:textbook --prefix server -- --file "/Users/qwe/Downloads/婚姻的意义.epub" --slug meaning-of-marriage --course keller-meaning-of-marriage --license-note "用户确认拥有平台登录用户阅读授权"
```

Output only:

```text
[import:textbook] imported meaning-of-marriage: <N> chapters
[import:textbook] bound meaning-of-marriage to keller-meaning-of-marriage: <M> required readings
```

No chapter body text may be logged.

- [ ] **Step 7: Verify**

Run:

```bash
npm run test --prefix server -- server/src/lib/textbook-html.test.js server/src/lib/textbook-epub.test.js
node server/src/scripts/import-textbook.js --file "/tmp/missing.epub" --slug missing
```

Expected: tests PASS; missing file command exits non-zero with a path error and no stack trace.

- [ ] **Step 8: Commit**

```bash
git add server/package.json server/src/lib/textbook-html.js server/src/lib/textbook-epub.js server/src/lib/textbook-bindings.js server/src/lib/textbook-html.test.js server/src/lib/textbook-epub.test.js server/src/scripts/import-textbook.js
git commit -m "Add EPUB textbook importer"
```

## Task 3: Textbook API And Course Reading Gate

**Files:**
- Create: `server/src/lib/textbook-reading.js`
- Create: `server/src/routes/textbooks.routes.js`
- Create: `server/src/lib/textbook-reading.test.js`
- Create: `server/src/routes/textbooks.routes.test.js`
- Modify: `server/src/routes/courses.routes.js`
- Modify: `server/src/index.js`

**Interfaces:**
- Consumes imported textbook rows and `course_unit_readings`.
- Produces API routes listed in the design spec.
- Extends course detail units with `readings`.
- Blocks `POST /api/courses/:slug/units/:index/submit` with HTTP 409 when required readings are incomplete.

- [ ] **Step 1: Write helper tests**

Test `incompleteRequiredReadings` query behavior through a fake `db.query` object:

```js
const db = {
  query: async () => ({
    rows: [{ chapter_title: '第 1 章', textbook_title: '婚姻的意义' }],
  }),
};
const rows = await incompleteRequiredReadings(db, { unitId: 'unit-1', userId: 'user-1' });
assert.equal(rows.length, 1);
```

- [ ] **Step 2: Implement DB helpers**

All helpers accept a `db` object with `.query(sql, params)`, so they work with the pool and transaction clients.

- [ ] **Step 3: Write route tests**

Use an Express test app with `req.user` injected for authenticated cases and omitted for unauthenticated cases. Assert unauthenticated chapter read returns 401; authenticated `GET /textbooks/:slug` returns chapter list without `body_html`; authenticated chapter endpoint returns one `chapter.body_html`; `POST /textbooks/:slug/chapters/:index/read` returns `{ ok: true }`.

- [ ] **Step 4: Implement textbook routes**

Routes:

```js
router.get('/textbooks', requireAuth, async (req, res) => {});
router.get('/textbooks/:slug', requireAuth, async (req, res) => {});
router.get('/textbooks/:slug/chapters/:index', requireAuth, async (req, res) => {});
router.post('/textbooks/:slug/chapters/:index/read', requireAuth, async (req, res) => {});
```

Error style must match existing routes: `{ error: '教材不存在' }`, `{ error: '章节不存在' }`.

- [ ] **Step 5: Extend course detail**

After loading `units`, call `readingsForCourseUnits({ courseId: course.id, userId: req.user?.id ?? null })` and attach `unit.readings = readingsByUnit.get(unit.id) ?? []`.

- [ ] **Step 6: Block premature unit submit**

Inside the existing transaction, before inserting into `unit_attempts`, call `incompleteRequiredReadings(db, { unitId: unit.id, userId: req.user.id })`. If it returns rows, return a blocked shape from the transaction and respond outside with:

```js
return res.status(409).json({
  error: '请先读完本单元绑定教材章节',
  readings: out.incompleteReadings,
});
```

- [ ] **Step 7: Mount routes**

Import `textbooksRoutes` in `server/src/index.js` and add `app.use('/api', textbooksRoutes);` beside courses.

- [ ] **Step 8: Verify**

Run:

```bash
npm run test --prefix server -- server/src/lib/textbook-reading.test.js server/src/routes/textbooks.routes.test.js
npm run test --prefix server -- server/src/lib/course-completion.test.js server/src/lib/course-exams.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/textbook-reading.js server/src/routes/textbooks.routes.js server/src/lib/textbook-reading.test.js server/src/routes/textbooks.routes.test.js server/src/routes/courses.routes.js server/src/index.js
git commit -m "Add textbook reading APIs"
```

## Task 4: Frontend Textbook Library And Reader

**Files:**
- Modify: `web/src/api/client.js`
- Modify: `web/src/main.jsx`
- Modify: `web/src/components/AppLayout.jsx`
- Create: `web/src/pages/Textbooks.jsx`
- Create: `web/src/pages/TextbookReader.jsx`
- Modify: `web/src/index.css`
- Create: `web/src/pages/Textbooks.test.mjs`

**Interfaces:**
- Consumes API routes from Task 3.
- Produces protected routes `/app/textbooks`, `/app/textbooks/:slug`, `/app/textbooks/:slug/chapters/:index`.

- [ ] **Step 1: Add API client**

```js
export const textbooks = {
  list: () => api.get('/textbooks'),
  detail: (slug) => api.get(`/textbooks/${slug}`),
  chapter: (slug, index) => api.get(`/textbooks/${slug}/chapters/${index}`),
  markRead: (slug, index) => api.post(`/textbooks/${slug}/chapters/${index}/read`),
};
```

- [ ] **Step 2: Add routes and nav**

Import `Textbooks` and `TextbookReader` in `web/src/main.jsx`. Add protected routes:

```jsx
<Route path="/textbooks" element={<Textbooks />} />
<Route path="/textbooks/:slug" element={<Textbooks />} />
<Route path="/textbooks/:slug/chapters/:index" element={<TextbookReader />} />
```

Add sidebar link:

```jsx
<NavLink to="/textbooks">教材</NavLink>
```

- [ ] **Step 3: Implement textbook library**

The library page loads `textbooks.list()`. If `slug` route param exists, also loads `textbooks.detail(slug)`. It renders book rows, progress, and chapter links. Error text must use existing style: `教材加载失败，请稍后重试`.

- [ ] **Step 4: Implement reader**

The reader loads `textbooks.chapter(slug, index)`, renders sanitized `body_html` using `dangerouslySetInnerHTML`, and has buttons for mark read, prev, next, back to table of contents, and optional `returnTo` query param.

- [ ] **Step 5: Add styles**

Use restrained content-page styles: `.textbook-list`, `.textbook-reader`, `.textbook-toc`, `.reader-body`, `.reader-actions`. Ensure `.reader-body` has `max-width: 760px`, `line-height: 1.8`, and `overflow-wrap: anywhere`.

- [ ] **Step 6: Add tests**

Mock the API client in a Node React test consistent with existing page tests. Assert:

```js
assert.match(container.textContent, /婚姻的意义/);
assert.match(container.textContent, /第 1 章/);
```

For the reader, assert mark-read button calls `textbooks.markRead('meaning-of-marriage', 1)`.

- [ ] **Step 7: Verify**

Run:

```bash
npm run test --prefix web -- web/src/pages/Textbooks.test.mjs
npm run lint --prefix web
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/api/client.js web/src/main.jsx web/src/components/AppLayout.jsx web/src/pages/Textbooks.jsx web/src/pages/TextbookReader.jsx web/src/index.css web/src/pages/Textbooks.test.mjs
git commit -m "Add textbook reader UI"
```

## Task 5: Course Page Textbook Integration

**Files:**
- Modify: `web/src/pages/Courses.jsx`
- Modify: `web/src/index.css`
- Create: `web/src/pages/CoursesTextbookReadings.test.mjs`

**Interfaces:**
- Consumes `unit.readings` from Task 3.
- Produces course unit UI showing required textbook chapters, read status, and direct reader links.

- [ ] **Step 1: Add tests**

Test a unit with one incomplete required reading:

```js
const unit = {
  unit_index: 1,
  readings: [{ textbook_slug: 'meaning-of-marriage', chapter_index: 1, chapter_title: '第 1 章', completed: false, required: true }],
};
```

Assert the UI contains `教材阅读`, `第 1 章`, and the read button is disabled or blocked with text telling the user to read required chapters first.

- [ ] **Step 2: Render readings**

Inside each unit detail, add a `CourseUnitReadings` component above `<CourseMaterial />`. It lists each reading with a link to:

```js
`/textbooks/${reading.textbook_slug}/chapters/${reading.chapter_index}?returnTo=${encodeURIComponent(`/courses`)}`
```

- [ ] **Step 3: Gate the unit button**

Compute:

```js
const requiredReadings = u.readings?.filter(item => item.required) || [];
const missingRequiredReadings = requiredReadings.filter(item => !item.completed);
const blockedByReadings = missingRequiredReadings.length > 0;
```

Disable button when `blockedByReadings` is true and show `请先读完本单元绑定教材章节`.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test --prefix web -- web/src/pages/CoursesTextbookReadings.test.mjs
npm run build --prefix web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Courses.jsx web/src/index.css web/src/pages/CoursesTextbookReadings.test.mjs
git commit -m "Link course units to textbook readings"
```

## Task 6: Local Import, Smoke, And Release Verification

**Files:**
- No source files expected unless verification exposes a bug.

**Interfaces:**
- Consumes all previous tasks.
- Produces a local database with `meaning-of-marriage` imported and bound to `keller-meaning-of-marriage`.

- [ ] **Step 1: Verify source file exists without printing content**

Run:

```bash
ls -lh "/Users/qwe/Downloads/婚姻的意义.epub"
zipinfo -1 "/Users/qwe/Downloads/婚姻的意义.epub" | sed -n '1,20p'
```

Expected: file exists; command prints only filenames.

- [ ] **Step 2: Apply migration locally**

Run:

```bash
npm run migrate:up --prefix server
npm run diagnose:schema --prefix server
```

Expected: PASS.

- [ ] **Step 3: Import authorized textbook**

Run:

```bash
npm run import:textbook --prefix server -- --file "/Users/qwe/Downloads/婚姻的意义.epub" --slug meaning-of-marriage --course keller-meaning-of-marriage --license-note "用户确认拥有平台登录用户阅读授权"
```

Expected: prints only imported chapter count and binding count.

- [ ] **Step 4: Run automated gates**

Run:

```bash
npm run test --prefix server
npm run test --prefix web
npm run lint --prefix web
npm run build --prefix web
npm run verify:release --prefix server
```

Expected: PASS.

- [ ] **Step 5: Browser smoke**

Start local backend and frontend if needed:

```bash
npm run dev --prefix server
npm run dev --prefix web -- --host 127.0.0.1
```

Smoke with the in-app browser:

- `/app/textbooks` shows《婚姻的意义》.
- `/app/textbooks/meaning-of-marriage` shows chapter list.
- `/app/textbooks/meaning-of-marriage/chapters/1` renders body text.
- Mark chapter read, return to courses, first bound unit no longer blocks because of that chapter.
- 390px viewport has no horizontal overflow.

- [ ] **Step 6: Final commit if verification fixes were needed**

```bash
git status --short
git add <changed-files>
git commit -m "Verify textbook reading flow"
```

## Self-Review

- Spec coverage: migration, importer, auth API, course gate, frontend reader, course UI integration, local import, and release verification are all covered by Tasks 1-6.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or vague “handle edge cases” instructions remain.
- Type consistency: `textbooks.slug`, `textbook_chapters.chapter_index`, `course_unit_readings.course_unit_id`, and frontend `reading.textbook_slug/chapter_index/completed` names are consistent across API and UI tasks.
- Scope control: search, highlights, notes, full-book downloads, and DRM are excluded from this plan.
