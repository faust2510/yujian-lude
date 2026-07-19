# 遇见路得 Figma 推特式生产 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录后的 React 应用完整替换为 Figma 已确认的推特式三栏 UI，并把同一构建准确部署到生产环境。

**Architecture:** 保留现有页面的数据请求和业务事件，在 `AppLayout` 建立路由感知的桌面三栏与移动外壳；新增小型共享视觉组件承载图标、页头、页签、卡片、人物行和安全提示。页面按现有业务状态重组 JSX，CSS 使用一套明确的 Figma token，不在旧布局后追加覆盖层。

**Tech Stack:** React 19、React Router 7、Vite 8、现有 Axios API、CSS 自定义属性、Node test runner、Codex Browser。

---

### Task 1: 锁定共享外壳契约

**Files:**
- Create: `web/src/components/AppLayout.test.mjs`
- Create: `web/src/components/FigmaUi.jsx`
- Create: `web/src/figma-ui.css`
- Modify: `web/src/components/AppLayout.jsx`

- [ ] **Step 1: 写失败测试**

```js
test('authenticated app uses the Figma desktop and mobile shell', () => {
  assert.match(layoutSource, /figma-app-shell/)
  assert.match(layoutSource, /figma-sidebar/)
  assert.match(layoutSource, /figma-right-rail/)
  assert.match(layoutSource, /figma-mobile-nav/)
  assert.match(cssSource, /--figma-sidebar:\s*236px/)
  assert.match(cssSource, /--figma-main:\s*900px/)
  assert.match(cssSource, /--figma-rail:\s*304px/)
})
```

- [ ] **Step 2: 运行测试并确认因缺少新外壳而失败**

Run: `npm test --prefix web -- --test-name-pattern="Figma desktop and mobile shell"`
Expected: FAIL，缺少 `figma-app-shell`。

- [ ] **Step 3: 实现共享组件和外壳**

实现 `FigmaIcon`、`FigmaPageHeader`、`FigmaTabs`、`FigmaCard`、`FigmaPersonRow`、`FigmaNotice`；`AppLayout` 输出 236/900/304 三栏与五项移动导航，并根据当前路由生成右栏内容。所有新样式写入 `figma-ui.css` 并限定在 `.figma-app-shell` 下，避免影响登录、教材、信仰测试、关系和后台页面。

- [ ] **Step 4: 运行外壳测试**

Run: `npm test --prefix web -- --test-name-pattern="Figma desktop and mobile shell"`
Expected: PASS。

### Task 2: 重组八个核心页面

**Files:**
- Create: `web/src/pages/FigmaCoreScreens.test.mjs`
- Modify: `web/src/pages/Dashboard.jsx`
- Modify: `web/src/pages/Match.jsx`
- Modify: `web/src/pages/Courses.jsx`
- Modify: `web/src/pages/Community.jsx`
- Modify: `web/src/pages/Chat.jsx`
- Modify: `web/src/pages/Profile.jsx`
- Modify: `web/src/pages/AiConsult.jsx`
- Modify: `web/src/pages/Vip.jsx`
- Modify: `web/src/figma-ui.css`

- [ ] **Step 1: 写八屏结构失败测试**

```js
for (const [file, marker] of Object.entries(markers)) {
  test(`${file} exposes its Figma core screen`, () => {
    assert.match(readPage(file), new RegExp(marker))
  })
}
```

`markers` 必须覆盖 `figma-home-feed`、`figma-daily-picks`、`figma-growth-feed`、`figma-community-feed`、`figma-letter-workspace`、`figma-profile-sheet`、`figma-ai-workbench`、`figma-membership-grid`。

- [ ] **Step 2: 运行测试并确认八个 marker 缺失**

Run: `npm test --prefix web -- --test-name-pattern="Figma core screen"`
Expected: FAIL。

- [ ] **Step 3: 逐页保留业务逻辑并替换视觉结构**

每页使用共享页头、卡片和状态组件；现有 API 调用、按钮处理函数、权限判断和错误反馈保持可执行。社区只重组顶层布局，不重写其内部业务函数。

- [ ] **Step 4: 运行核心屏测试和现有测试**

Run: `npm test --prefix web`
Expected: 全部 PASS。

### Task 3: 响应式和视觉对照

**Files:**
- Modify: `web/src/figma-ui.css`
- Create during QA then remove: `.tmp/figma-ui-qa/*`

- [ ] **Step 1: 添加移动结构断言**

断言 `390px` 下隐藏桌面左右栏、显示 74px 底栏、主区无横向溢出。

- [ ] **Step 2: 在浏览器运行 1440×1024 与 390×844 截图**

Run: `npm run dev --prefix web -- --host 127.0.0.1`
Expected: `/app/` 可打开并完成登录或本地认证态预览。

- [ ] **Step 3: 建立差异清单并逐项修正**

至少比较三栏宽度、首屏层级、调色板、标题字体、卡片边框/阴影、导航选中态、移动底栏和主要按钮八项。

- [ ] **Step 4: 使用 `view_image` 同时检查 Figma 导出图和最新浏览器截图**

Expected: 无仍可修复的明显视觉偏差。

### Task 4: 发布完整性与生产部署

**Files:**
- Build: `web-dist/*`
- Modify if needed: `ops/deploy-runbook.md`

- [ ] **Step 1: 运行发布门禁**

Run: `npm test --prefix web && npm run lint --prefix web && npm run build --prefix web && git diff --check`
Expected: 所有命令退出码 0。

- [ ] **Step 2: 记录发布来源**

记录当前 commit SHA、`web-dist/index.html` 引用的 JS/CSS 文件名和构建时间；确保新 UI 源码与构建产物位于同一发布提交。

- [ ] **Step 3: 部署准确提交**

服务器必须检出记录的提交后重新构建并重启，不能从未包含新 UI 的旧 `origin/main` 构建。

- [ ] **Step 4: 线上验证**

验证 `/api/health`、`/api/ready`、`/app/`、登录和核心路由；核对服务器 HEAD、线上静态资源名与本地记录一致，并保存 1440px 线上截图与 Figma 对照。
