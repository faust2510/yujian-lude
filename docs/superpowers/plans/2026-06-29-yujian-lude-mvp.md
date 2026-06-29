# Yujian Lude MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 遇见路得 run as a coherent MVP at `/app`, with registration,入池 qualification, admin endorsement review, matching, chat, and global community basics aligned.

**Architecture:** Keep the root static homepage at `/`, mount the React application build under `/app`, and keep Express API routes under `/api`. Move match-pool qualification into a shared backend helper so matching and community posting use the same gate. Keep relationship confirmation and pastor console out of the exposed MVP navigation.

**Tech Stack:** Node.js, Express, PostgreSQL schema SQL, React, Vite, Axios, Node built-in test runner.

---

### Task 1: Repository Hygiene

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create root ignore rules**

Add `.gitignore` with:

```gitignore
.DS_Store
node_modules/
*/node_modules/
.env
*.log
logs/
dist/
dist-ssr/
coverage/
.playwright-cli/
.playwright-mcp/
.od-skills/
```

- [ ] **Step 2: Check ignored files are no longer listed**

Run: `git status --short --ignored`

Expected: local caches and node modules appear as ignored (`!!`) or disappear from normal untracked output; source files remain visible.

### Task 2: Mount React App At `/app`

**Files:**
- Modify: `web/vite.config.js`
- Modify: `web/src/main.jsx`
- Modify: `web/src/api/client.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Update Vite base and dev proxy**

Change `web/vite.config.js` so `base` is `/app/` and the dev proxy rewrites `/api` to `http://localhost:8090`:

```js
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 2: Update React router basename**

Change `web/src/main.jsx`:

```jsx
<BrowserRouter basename="/app">
```

- [ ] **Step 3: Update API base URL**

Change `web/src/api/client.js`:

```js
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})
```

- [ ] **Step 4: Mount static homepage and app build in Express**

In `server/src/index.js`, keep the project root static homepage and add a dedicated `/app` mount for `web-dist`:

```js
const projectRoot = path.resolve(__dirname, '../../');
const appRoot = path.resolve(projectRoot, 'web-dist');

app.use('/app', express.static(appRoot, { index: 'index.html' }));
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'));
});

app.use(express.static(projectRoot, { index: 'index.html', extensions: ['html'] }));
```

- [ ] **Step 5: Verify build output points to `/app`**

Run: `npm run build --prefix web`

Expected: `web-dist/index.html` references `/app/assets/...`.

### Task 3: Unify Branding And Homepage Entry Links

**Files:**
- Modify: `README.md`
- Modify: `brand-spec.md`
- Modify: `app.js`
- Modify: `index.html`

- [ ] **Step 1: Rename README heading**

Change the README title from `迦南之约` to `遇见路得`.

- [ ] **Step 2: Rename brand spec heading**

Change the brand spec title from `迦南之约 — Brand Spec` to `遇见路得 — Brand Spec`.

- [ ] **Step 3: Rename local storage key**

Change the static prototype storage key in `app.js`:

```js
const STORAGE_KEY = "yujian_lude_profile";
```

- [ ] **Step 4: Ensure homepage app links use `/app`**

Run: `rg -n 'href="/app|href="/yujian|迦南|canaan' README.md brand-spec.md index.html app.js`

Expected: no `/yujian` app entry links and no remaining user-facing `迦南` or `canaan` in the main prototype files.

### Task 4: Shared Match-Pool Gate

**Files:**
- Create: `server/src/lib/match-gate.js`
- Modify: `server/src/routes/match.routes.js`
- Modify: `server/src/routes/community.routes.js`
- Test: `server/src/lib/match-qualification.test.js`

- [ ] **Step 1: Create shared gate helper**

Create `server/src/lib/match-gate.js`:

```js
import { query, one } from '../db.js';
import { getSetting } from '../settings.js';
import { buildMatchQualification } from './match-qualification.js';

function settingValue(setting) {
  return setting && typeof setting === 'object' && 'value' in setting ? setting.value : setting;
}

export async function getMatchGateSettings() {
  return {
    requireTest: settingValue(await getSetting('match.require_faith_test')) !== false,
    requireEndorsement: settingValue(await getSetting('match.require_verified_pastor')) !== false,
    requireCourse: settingValue(await getSetting('match.require_light_course')) !== false,
    lightCourseId: settingValue(await getSetting('match.light_course_id')),
  };
}

export async function getMatchQualification(userId) {
  const gate = await getMatchGateSettings();
  const profile = await one('SELECT completion, privacy_ok FROM profiles WHERE user_id=$1', [userId]);
  const faith = await one('SELECT church_name, testimony FROM faith_profiles WHERE user_id=$1', [userId]);
  const testRow = await one(
    `SELECT passed FROM faith_tests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const { rows: endorsements } = await query(
    `SELECT kind, state FROM endorsements WHERE user_id = $1`,
    [userId]
  );

  let lightCourseCompleted = true;
  if (gate.requireCourse) {
    lightCourseCompleted = false;
    if (gate.lightCourseId) {
      const done = await one(
        `SELECT 1 FROM course_progress WHERE user_id = $1 AND course_id = $2 AND state = 'completed' LIMIT 1`,
        [userId, gate.lightCourseId]
      );
      lightCourseCompleted = !!done;
    }
  }

  return buildMatchQualification({
    profile,
    faith,
    faithTestPassed: gate.requireTest ? !!testRow?.passed : true,
    endorsements: gate.requireEndorsement ? endorsements : [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted,
  });
}

export async function isInMatchPool(userId) {
  return (await getMatchQualification(userId)).inPool;
}
```

- [ ] **Step 2: Use shared gate in match routes**

Remove the local `getMatchGateSettings`, `getQualification`, and `inMatchPool` functions from `server/src/routes/match.routes.js`. Import:

```js
import { getMatchGateSettings, getMatchQualification, isInMatchPool } from '../lib/match-gate.js';
```

Then update references:

```js
res.json(await getMatchQualification(req.user.id));
if (!(await isInMatchPool(req.user.id))) {
  const status = await getMatchQualification(req.user.id);
  return res.json({ candidates: [], locked: true, reason: status.gate, status });
}
if (!(await isInMatchPool(req.user.id))) return res.status(403).json({ error: '尚未进入匹配池' });
```

- [ ] **Step 3: Use shared gate for community posting**

In `server/src/routes/community.routes.js`, import:

```js
import { isInMatchPool } from '../lib/match-gate.js';
```

Replace `canPost` so it returns:

```js
async function canPost(userId) {
  return isInMatchPool(userId);
}
```

Update the post error message to:

```js
return res.status(403).json({ error: '需完成资料、信仰测试、背书审核与恋爱必修课后方可发帖' });
```

- [ ] **Step 4: Run existing gate tests**

Run: `node --test server/src/lib/match-qualification.test.js`

Expected: all tests pass.

### Task 5: Match Intent And Chat Channel Stability

**Files:**
- Create: `server/src/lib/match-intent.js`
- Create: `server/src/lib/match-intent.test.js`
- Modify: `server/src/routes/match.routes.js`
- Modify: `server/db/schema.sql`

- [ ] **Step 1: Add intent normalization helper**

Create `server/src/lib/match-intent.js`:

```js
const INTENTS = new Set(['like', 'pass']);

export function normalizeMatchIntent(value) {
  const intent = String(value || 'like').trim();
  if (!INTENTS.has(intent)) return null;
  return intent;
}

export function statusForIntent(intent) {
  if (intent === 'pass') return 'declined';
  return 'intent_sent';
}
```

- [ ] **Step 2: Add unit tests**

Create `server/src/lib/match-intent.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMatchIntent, statusForIntent } from './match-intent.js';

test('normalizes supported match intents', () => {
  assert.equal(normalizeMatchIntent(undefined), 'like');
  assert.equal(normalizeMatchIntent('like'), 'like');
  assert.equal(normalizeMatchIntent('pass'), 'pass');
  assert.equal(normalizeMatchIntent('skip'), null);
});

test('maps intents to persisted match statuses', () => {
  assert.equal(statusForIntent('like'), 'intent_sent');
  assert.equal(statusForIntent('pass'), 'declined');
});
```

- [ ] **Step 3: Update schema match enum and chat uniqueness**

Change `server/db/schema.sql` match status enum to include `matched`:

```sql
CREATE TYPE match_status AS ENUM ('suggested', 'intent_sent', 'matched', 'under_review', 'approved', 'declined');
```

Add a uniqueness constraint to `chat_channels`:

```sql
    UNIQUE (user_a, user_b)
```

- [ ] **Step 4: Use intent helper in route**

In `server/src/routes/match.routes.js`, import:

```js
import { normalizeMatchIntent, statusForIntent } from '../lib/match-intent.js';
```

At the start of `router.post('/match/:targetId/intent'...)`, add:

```js
const intent = normalizeMatchIntent(req.body?.intent);
if (!intent) return res.status(400).json({ error: '非法意向操作' });
const nextStatus = statusForIntent(intent);
```

Use `nextStatus` in the upsert. If `intent === 'pass'`, return `{ ok: true, mutual: false }` after saving `declined`, before awarding points or checking mutual.

- [ ] **Step 5: Make chat channel insert idempotent**

Change chat channel creation to:

```sql
INSERT INTO chat_channels (match_id, user_a, user_b) VALUES ($1,$2,$3)
ON CONFLICT (user_a, user_b) DO NOTHING
```

- [ ] **Step 6: Run intent and qualification tests**

Run: `node --test server/src/lib/*.test.js`

Expected: all tests pass.

### Task 6: Defer Relationship Pastor Approval Safely

**Files:**
- Modify: `server/src/routes/relationships.routes.js`

- [ ] **Step 1: Return explicit non-MVP response for pastor approval**

At the start of the `/relationships/:id/pastor-approve` handler, before querying `endorsements`, return:

```js
return res.status(501).json({ error: '关系确立牧者审核暂未开放' });
```

- [ ] **Step 2: Remove MVP-breaking match status writes**

Remove writes that set `matches.status = 'in_relationship'` and deletes that depend on `status = 'in_relationship'`. The relationship table can still track `confirmed` or `ended`, but match status stays within the MVP enum.

- [ ] **Step 3: Check for invalid status literals**

Run: `rg -n "matched|in_relationship|endorser_id" server/src server/db/schema.sql`

Expected: `matched` appears in match route and schema; `in_relationship` and `endorser_id` do not appear in executable route SQL.

### Task 7: MVP Navigation And Admin Scope

**Files:**
- Modify: `web/src/components/AppLayout.jsx`
- Modify: `web/src/pages/Admin.jsx`
- Modify: `web/src/pages/Courses.jsx`

- [ ] **Step 1: Hide non-MVP nav links**

Remove visible links for `/relationships` and `/pastor` from `AppLayout.jsx`. Keep routes in `main.jsx` for now so existing code remains reachable by direct URL if needed.

- [ ] **Step 2: Reduce admin tabs to MVP scope**

In `Admin.jsx`, change tab list to:

```js
[['settings','配置'],['endorsements','背书审核'],['users','用户']]
```

Remove the rendered `PastorsTab` branch and the non-MVP `posts` tab branch from visible tab branches.

- [ ] **Step 3: Update course subtitle copy**

In `Courses.jsx`, change the subtitle to:

```jsx
<p className="page-sub">完成恋爱必修课后可进入匹配池；凯勒课程作为进阶装备提升曝光</p>
```

- [ ] **Step 4: Build React app**

Run: `npm run build --prefix web`

Expected: build succeeds.

### Task 8: Verify `/app` Build And Static Mount

**Files:**
- Generated: `web-dist/index.html`

- [ ] **Step 1: Rebuild app**

Run: `npm run build --prefix web`

Expected: `web-dist/index.html` references `/app/assets/...`.

- [ ] **Step 2: Run backend without connecting a user session**

Run: `npm start --prefix server`

Expected: server starts on configured port and `/api/health` can be requested.

- [ ] **Step 3: Probe routes**

In another terminal, run:

```bash
curl -s http://localhost:8090/api/health
curl -I http://localhost:8090/
curl -I http://localhost:8090/app
curl -I http://localhost:8090/app/login
```

Expected: health returns JSON with `ok: true`; homepage and app routes return HTTP 200.

### Task 9: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run backend unit tests**

Run: `node --test server/src/lib/*.test.js`

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run: `npm run build --prefix web`

Expected: Vite build succeeds.

- [ ] **Step 3: Inspect git status and diff**

Run: `git status --short --ignored && git diff --stat && git diff --check`

Expected: no whitespace errors; diff matches MVP scope.
