# AI Consult Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/app/ai` into a polished, bounded consultation tool page without changing backend AI behavior.

**Architecture:** Keep the existing `AiConsult` React page and `ai` API client. Add a narrow frontend source test to protect the key rendered sections, then update component markup and `index.css` styles using existing design tokens.

**Tech Stack:** React 19, React Router, Vite, plain CSS, Node built-in test runner.

---

### Task 1: Lock The Expected AI Page Structure

**Files:**
- Create: `web/src/pages/AiConsult.test.mjs`
- Modify: `web/package.json`

- [ ] **Step 1: Write the failing source-level test**

Create `web/src/pages/AiConsult.test.mjs` with assertions that the AI page contains the new consultation desk sections and style hooks:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(path.join(__dirname, 'AiConsult.jsx'), 'utf8');
const cssSource = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

test('AI consult page exposes a consultation desk layout', () => {
  assert.match(pageSource, /ai-page/);
  assert.match(pageSource, /咨询边界/);
  assert.match(pageSource, /最近咨询/);
  assert.match(pageSource, /参考依据/);
  assert.match(pageSource, /safeGuidancePrompts/);
  assert.match(cssSource, /\.ai-page/);
  assert.match(cssSource, /\.ai-prompt-chip/);
  assert.match(cssSource, /\.ai-boundary-panel/);
});
```

- [ ] **Step 2: Add the web test command**

Update `web/package.json`:

```json
"test": "node --test \"src/**/*.test.mjs\""
```

- [ ] **Step 3: Verify the test fails before implementation**

Run:

```bash
npm run test --prefix web
```

Expected: FAIL because `AiConsult.jsx` and `index.css` do not yet contain the new structure.

### Task 2: Implement The Consultation Desk Markup

**Files:**
- Modify: `web/src/pages/AiConsult.jsx`

- [ ] **Step 1: Replace the current simple form/side card with structured sections**

Add:

- `safeGuidancePrompts` array.
- Prompt chips that call `setQuestion(prompt)`.
- Header with scope badge.
- Main consultation panel with textarea, submit button, helper text, and answer panel.
- Side rail with consultation boundaries, recent history, and escalation copy.

- [ ] **Step 2: Preserve behavior**

Keep:

- `ai.ask(text)` submit behavior.
- `ai.history()` loading and refresh.
- `loading`, `error`, `answer`, and `history` state semantics.
- Out-of-scope styling based on `answer.outOfScope`.

### Task 3: Implement The Visual System

**Files:**
- Modify: `web/src/index.css`

- [ ] **Step 1: Replace the AI consultation CSS block**

Update only the `/* AI consultation */` section plus mobile adjustments. Add stable desktop and mobile layout classes:

- `.ai-page`
- `.ai-kicker`
- `.ai-header-row`
- `.ai-scope-badge`
- `.ai-layout`
- `.ai-main`
- `.ai-composer`
- `.ai-prompt-chip`
- `.ai-answer`
- `.ai-boundary-panel`
- `.ai-history-panel`
- `.ai-escalation`

- [ ] **Step 2: Keep the app’s existing design tokens**

Use `--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--brand`, `--brand-soft`, `--success`, `--warn`, and `--danger`. Do not introduce a new palette or global radius change.

### Task 4: Verify Locally

**Files:**
- No code changes expected after this task unless verification finds defects.

- [ ] **Step 1: Run focused web test**

Run:

```bash
npm run test --prefix web
```

Expected: PASS.

- [ ] **Step 2: Run frontend lint**

Run:

```bash
npm run lint --prefix web
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
npm run build --prefix web
```

Expected: PASS.

- [ ] **Step 4: Run release verification if local database is available**

Run:

```bash
npm run verify:release --prefix server
```

Expected: PASS, or report the exact infrastructure blocker.
