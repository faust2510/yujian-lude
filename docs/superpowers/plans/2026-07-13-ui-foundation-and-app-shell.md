# 遇见路得 UI 基础与应用骨架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 React 应用接入 shadcn 设计系统，收敛登录后导航并重构动态首页，同时保持现有路由、API 与业务资格判断不变。

**Architecture:** 使用 Nova preset、Radix base、Lucide icons 和 Tailwind v4 建立语义化设计系统。导航归属和首页主行动提取为无 React 依赖的纯函数并以 Node test 验证；应用骨架通过独立桌面侧栏、移动顶部栏、底部导航和用户菜单组成。旧页面 CSS 在迁移期保留，第一阶段仅删除被新骨架与 Dashboard 明确替代的样式。

**Tech Stack:** React 19、React Router 7、Vite 8、JavaScript、Tailwind CSS v4、shadcn/ui、Radix UI、Lucide React、Node test、Playwright CLI。

---

## 文件结构

### 新建

- `web/components.json`：shadcn 项目配置。
- `web/jsconfig.json`：`@/*` 别名配置。
- `web/src/lib/utils.js`：shadcn `cn()` 工具。
- `web/src/lib/navigation.js`：主空间和路由归属的唯一配置源。
- `web/src/lib/navigation.test.mjs`：导航归属测试。
- `web/src/lib/dashboard-priority.js`：首页主行动选择逻辑。
- `web/src/lib/dashboard-priority.test.mjs`：首页主行动测试。
- `web/src/components/app/AppSidebar.jsx`：桌面侧栏。
- `web/src/components/app/MobileHeader.jsx`：移动顶部栏。
- `web/src/components/app/MobileNavigation.jsx`：移动底部导航。
- `web/src/components/app/UserMenu.jsx`：资料、测试、套餐、管理台与退出菜单。
- `web/src/components/dashboard/QualificationProgress.jsx`：可折叠资格进度。
- `web/src/components/ui/*`：由 shadcn CLI 生成的源代码组件。

### 修改

- `web/package.json`、`web/package-lock.json`：Tailwind、shadcn 组件和图标依赖。
- `web/vite.config.js`：`@` 别名。
- `web/src/index.css`：Tailwind 入口、语义令牌、应用骨架与 Dashboard 样式。
- `web/src/main.jsx`：全局 Tooltip 与 Sonner Provider。
- `web/src/components/AppLayout.jsx`：组合新应用骨架。
- `web/src/pages/Dashboard.jsx`：单主行动首页。
- `web/src/pages/CommunityResponsive.test.mjs`：适配新的移动导航样式定位，保留社区防溢出断言。

## Task 1：建立导航归属的失败测试

**Files:**
- Create: `web/src/lib/navigation.test.mjs`
- Create: `web/src/lib/navigation.js`

- [ ] **Step 1：先写导航配置测试**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { MAIN_SECTIONS, resolvePrimarySection } from './navigation.js'

test('application exposes four primary spaces', () => {
  assert.deepEqual(MAIN_SECTIONS.map((item) => item.key), [
    'home', 'meet', 'grow', 'community',
  ])
})

test('existing routes resolve to their primary space', () => {
  const expectations = {
    '/': 'home',
    '/match': 'meet',
    '/chat': 'meet',
    '/relationships': 'meet',
    '/courses': 'grow',
    '/textbooks': 'grow',
    '/textbooks/meaning-of-marriage/chapters/3': 'grow',
    '/ai': 'grow',
    '/faith-test': 'grow',
    '/community': 'community',
    '/community/user/example': 'community',
  }

  for (const [pathname, expected] of Object.entries(expectations)) {
    assert.equal(resolvePrimarySection(pathname), expected)
  }
})
```

- [ ] **Step 2：运行测试并确认 RED**

Run: `npm test --prefix web -- src/lib/navigation.test.mjs`

Expected: FAIL，错误为无法导入 `./navigation.js` 或缺少导出。

- [ ] **Step 3：实现最小导航配置**

```js
export const MAIN_SECTIONS = [
  { key: 'home', label: '首页', to: '/', match: ['/'] },
  { key: 'meet', label: '认识', to: '/match', match: ['/match', '/chat', '/relationships'] },
  { key: 'grow', label: '成长', to: '/courses', match: ['/courses', '/textbooks', '/ai', '/faith-test'] },
  { key: 'community', label: '社区', to: '/community', match: ['/community'] },
]

export function resolvePrimarySection(pathname) {
  const section = MAIN_SECTIONS.find((item) =>
    item.match.some((prefix) => prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`))
  )
  return section?.key ?? null
}
```

- [ ] **Step 4：运行测试并确认 GREEN**

Run: `npm test --prefix web -- src/lib/navigation.test.mjs`

Expected: 2 tests pass，0 fail。

- [ ] **Step 5：提交**

```bash
git add web/src/lib/navigation.js web/src/lib/navigation.test.mjs
git commit -m "Add primary application navigation model"
```

## Task 2：初始化 shadcn 设计系统

**Files:**
- Create: `web/components.json`
- Create: `web/jsconfig.json`
- Create: `web/src/lib/utils.js`
- Create: `web/src/components/ui/*`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/vite.config.js`
- Modify: `web/src/index.css`

- [ ] **Step 1：记录初始化前状态**

Run: `git status --short && npx shadcn@latest info --json`

Expected: 工作树干净；`config` 为 `null`、`components` 为空。

- [ ] **Step 2：初始化 Nova + Radix + CSS variables**

Run from `web/`:

```bash
npx shadcn@latest init --template vite --preset nova --base radix --css-variables --yes
```

Expected: 创建 `components.json`、Tailwind 入口、工具函数和别名配置；保持项目为 JavaScript。

- [ ] **Step 3：检查初始化差异并修正项目路径**

确认：

```json
{
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

`vite.config.js` 必须保留 `/app/` base、`../web-dist` 输出和 `/api` proxy，并增加：

```js
import path from 'node:path'

resolve: {
  alias: { '@': path.resolve(import.meta.dirname, './src') },
},
```

- [ ] **Step 4：查询文档并添加第一阶段组件**

Run from `web/`:

```bash
npx shadcn@latest docs sidebar button badge avatar dropdown-menu tooltip separator progress alert skeleton collapsible sheet sonner
npx shadcn@latest add sidebar button badge avatar dropdown-menu tooltip separator progress alert skeleton collapsible sheet sonner
```

Expected: 组件出现在 `web/src/components/ui/`；CLI 不覆盖业务页面。

- [ ] **Step 5：按 shadcn 规则审查生成文件**

检查 Avatar fallback、DropdownMenuGroup、SheetTitle、Radix `asChild`、Lucide imports、语义色和 `cn()`。不得加入原始品牌色或手写 overlay z-index。

- [ ] **Step 6：建立遇见路得语义令牌**

在 `web/src/index.css` 的 Tailwind/shadcn 主题区定义暖白 background、近黑 foreground、盟约蓝 primary、珊瑚 accent、深绿 success 和暖灰 border；保留旧变量作为迁移别名：

```css
:root {
  --background: oklch(0.98 0.008 80);
  --foreground: oklch(0.22 0.012 55);
  --primary: oklch(0.50 0.16 255);
  --primary-foreground: oklch(0.99 0 0);
  --accent: oklch(0.68 0.12 35);
  --accent-foreground: oklch(0.20 0.01 45);
  --success: oklch(0.52 0.13 150);
  --border: oklch(0.90 0.012 75);
  --radius: 0.5rem;

  --brand: var(--primary);
  --brand-dark: var(--primary);
  --brand-soft: var(--secondary);
  --bg: var(--background);
  --surface: var(--card);
  --fg: var(--foreground);
  --muted: var(--muted-foreground);
}
```

实际变量必须与 shadcn 生成的变量名合并，不得重复定义同名 token。

- [ ] **Step 7：验证构建与旧测试**

Run:

```bash
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
```

Expected: 所有命令 exit 0；若 Tailwind preflight 影响旧源码断言，只调整断言定位，不删除行为验证。

- [ ] **Step 8：提交**

```bash
git add web
git commit -m "Initialize shadcn design system"
```

## Task 3：重构响应式应用骨架

**Files:**
- Create: `web/src/components/app/AppSidebar.jsx`
- Create: `web/src/components/app/MobileHeader.jsx`
- Create: `web/src/components/app/MobileNavigation.jsx`
- Create: `web/src/components/app/UserMenu.jsx`
- Modify: `web/src/components/AppLayout.jsx`
- Modify: `web/src/main.jsx`
- Modify: `web/src/index.css`
- Test: `web/src/lib/navigation.test.mjs`

- [ ] **Step 1：扩展失败测试，要求用户入口与移动导航标签存在**

```js
import { USER_MENU_ITEMS } from './navigation.js'

test('account actions live outside primary navigation', () => {
  assert.deepEqual(USER_MENU_ITEMS.map((item) => item.to), [
    '/profile', '/faith-test', '/vip',
  ])
  assert.equal(MAIN_SECTIONS.some((item) => item.to === '/profile'), false)
})
```

- [ ] **Step 2：运行测试并确认 RED**

Run: `npm test --prefix web -- src/lib/navigation.test.mjs`

Expected: FAIL，`USER_MENU_ITEMS` 未导出。

- [ ] **Step 3：补充用户菜单配置并确认 GREEN**

```js
export const USER_MENU_ITEMS = [
  { label: '个人与信仰资料', to: '/profile' },
  { label: '信仰基础测试', to: '/faith-test' },
  { label: '会员套餐', to: '/vip' },
]
```

Run: `npm test --prefix web -- src/lib/navigation.test.mjs`

Expected: 3 tests pass。

- [ ] **Step 4：实现桌面侧栏和移动导航**

使用 `SidebarProvider`、`Sidebar`、`SidebarMenuButton asChild`、`Avatar`、`DropdownMenu`、`Tooltip` 和 Lucide 图标。`NavLink` 的 active 状态由 `resolvePrimarySection(location.pathname)` 决定。移动底部导航必须渲染四个主空间，并使用：

```jsx
<nav className="app-mobile-nav" aria-label="主导航">
  {MAIN_SECTIONS.map((item) => (
    <NavLink key={item.key} to={item.to} aria-current={active === item.key ? 'page' : undefined}>
      <item.icon aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  ))}
</nav>
```

- [ ] **Step 5：实现用户菜单和全局消息入口**

用户头像必须带 `AvatarFallback`。管理员菜单项仅在 `user.role === 'admin'` 时出现。退出调用现有 `logout()`，成功后导航至 `/login`。消息图标链接 `/chat` 并提供 `aria-label="私信"` 与 Tooltip。

- [ ] **Step 6：组合 AppLayout 与 Providers**

`AppLayout` 只负责骨架组合：

```jsx
<SidebarProvider>
  <AppSidebar user={user} onLogout={handleLogout} />
  <div className="app-frame">
    <MobileHeader user={user} onLogout={handleLogout} />
    <main className="app-main"><Outlet /></main>
    <MobileNavigation />
  </div>
</SidebarProvider>
```

在 `main.jsx` 增加 `TooltipProvider` 与 `<Toaster />`，不得改变路由树。

- [ ] **Step 7：实现响应式与安全区**

```css
.app-mobile-header,
.app-mobile-nav { display: none; }

@media (max-width: 768px) {
  .app-desktop-sidebar { display: none; }
  .app-mobile-header { display: flex; }
  .app-mobile-nav {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding-bottom: env(safe-area-inset-bottom);
  }
  .app-main { padding-bottom: calc(5rem + env(safe-area-inset-bottom)); }
}
```

触控目标至少 44px，360px 不横向溢出；全局增加 `:focus-visible` 与 `prefers-reduced-motion` 规则。

- [ ] **Step 8：验证**

Run:

```bash
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
```

Expected: 全部 exit 0。

- [ ] **Step 9：提交**

```bash
git add web/src/components web/src/lib web/src/main.jsx web/src/index.css
git commit -m "Build responsive application shell"
```

## Task 4：以 TDD 建立首页主行动模型

**Files:**
- Create: `web/src/lib/dashboard-priority.js`
- Create: `web/src/lib/dashboard-priority.test.mjs`

- [ ] **Step 1：写失败测试**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { getDashboardPrimaryAction } from './dashboard-priority.js'

test('returns first incomplete qualification action', () => {
  const action = getDashboardPrimaryAction({
    inPool: false,
    profileComplete: true,
    faithProfileComplete: false,
  })
  assert.equal(action.key, 'faithProfile')
  assert.equal(action.to, '/profile')
})

test('returns match action after entering pool', () => {
  const action = getDashboardPrimaryAction({ inPool: true })
  assert.deepEqual(action, {
    key: 'match',
    label: '看看今天的新遇见',
    action: '开始认识',
    to: '/match',
  })
})

test('returns null while qualification is unavailable', () => {
  assert.equal(getDashboardPrimaryAction(null), null)
})
```

- [ ] **Step 2：运行并确认 RED**

Run: `npm test --prefix web -- src/lib/dashboard-priority.test.mjs`

Expected: FAIL，缺少模块或导出。

- [ ] **Step 3：实现最小纯函数**

将 `GATE_STEPS` 从 `Dashboard.jsx` 移入该模块并导出；按顺序返回第一个未完成步骤，`inPool` 时返回匹配行动，不读取 React 状态或 API。

- [ ] **Step 4：运行并确认 GREEN**

Run: `npm test --prefix web -- src/lib/dashboard-priority.test.mjs`

Expected: 3 tests pass。

- [ ] **Step 5：提交**

```bash
git add web/src/lib/dashboard-priority.js web/src/lib/dashboard-priority.test.mjs
git commit -m "Model dashboard primary action"
```

## Task 5：重构 Dashboard 为单主行动首页

**Files:**
- Create: `web/src/components/dashboard/QualificationProgress.jsx`
- Modify: `web/src/pages/Dashboard.jsx`
- Modify: `web/src/index.css`
- Test: `web/src/lib/dashboard-priority.test.mjs`

- [ ] **Step 1：保留数据流，替换视觉层级**

继续使用 `Promise.allSettled([points.balance(), matches.status()])`，保留签到 409 后重新读取余额的行为。删除重复的“下一步做什么”三卡区域。

首页结构固定为：

```jsx
<div className="dashboard-page page-enter">
  <DashboardHeader />
  <PrimaryAction action={primaryAction} qualification={qualification} />
  <QualificationProgress steps={GATE_STEPS} qualification={qualification} />
  <div className="dashboard-secondary-grid">
    <GrowthContinuation />
    <CompactPointsCheckin />
  </div>
</div>
```

第一阶段没有课程续读 API 聚合时，`GrowthContinuation` 只提供“进入成长空间”入口，不伪造进度或统计。

- [ ] **Step 2：使用 shadcn 状态组件**

- 加载：Skeleton。
- 可恢复错误：Alert + 重试 Button。
- 状态：Badge。
- 资格进度：Progress + Collapsible。
- 签到反馈：`toast.success` / `toast.error`；页面内不再保留长期成功消息块。
- Link 按钮使用 Radix `asChild`。

- [ ] **Step 3：实现 QualificationProgress**

默认只显示“已完成 X/5”和进度条；用户展开后显示五项明细。完成项使用 Check 图标和 Badge，未完成项链接到现有路由。不得再用圆形数字 div、emoji 或原始绿色值。

- [ ] **Step 4：实现克制动效**

仅使用 `.page-enter` 150-240ms 淡入位移、按钮 active 反馈、Collapsible/Progress 状态过渡；`prefers-reduced-motion` 下关闭。

- [ ] **Step 5：运行行为与质量验证**

Run:

```bash
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
git diff --check
```

Expected: 全部 exit 0，Dashboard 不再包含文本“下一步做什么”。

- [ ] **Step 6：提交**

```bash
git add web/src/pages/Dashboard.jsx web/src/components/dashboard web/src/index.css
git commit -m "Redesign dashboard around one primary action"
```

## Task 6：Playwright 桌面与移动视觉验收

**Files:**
- Modify only if verification finds a reproducible issue in Phase 1 files.

- [ ] **Step 1：启动本地前后端**

```bash
npm start --prefix server
npm run dev --prefix web -- --host 127.0.0.1
```

Expected: API 在 8090，Vite 在可用本地端口。

- [ ] **Step 2：登录测试账号并检查桌面**

使用 Playwright CLI，在 1440x900 和 1280x800 检查：侧栏、active 状态、消息入口、用户菜单、单主行动、资格折叠和签到反馈。

- [ ] **Step 3：检查移动端**

在 390x844 和 360x800 检查：底部四项导航、顶部消息与头像、safe-area、无横向溢出、长邮箱/昵称不撑破布局。

- [ ] **Step 4：检查 reduced motion 和键盘**

确认 Tab 能遍历导航、头像菜单与主 CTA；焦点清晰；Tooltip 有可访问名称；减少动态偏好下无位移动画。

- [ ] **Step 5：修复时遵循 TDD**

若发现行为缺陷，先在 `navigation.test.mjs`、`dashboard-priority.test.mjs` 或现有响应式源码测试中加入失败用例，再做最小修复并复跑。

- [ ] **Step 6：完整发布前验证**

```bash
npm run test --prefix server
npm run test --prefix web
npm run lint --prefix web
npm run build --prefix web
npm run verify:release --prefix server
git diff --check
git status --short
```

Expected: 全部 exit 0；工作树只包含计划内改动或干净。

- [ ] **Step 7：提交验证修复（如有）**

```bash
git add web
git commit -m "Polish responsive application shell"
```

若没有修复，不创建空提交。

## Task 7：最终规格与代码质量审查

**Files:**
- Review all commits since `4caea2a`.

- [ ] **Step 1：规格符合性审查**

独立审查者逐项核对设计规格：四主空间、用户菜单、旧路由保留、移动导航、一个主行动、shadcn 组合规则、三类动效限制、错误和加载状态。

- [ ] **Step 2：修复所有 Critical/Important 问题并复审**

任何行为修改必须补失败测试；生成组件问题按 shadcn 文档修正。

- [ ] **Step 3：代码质量审查**

重点检查：重复导航配置、内联样式回流、原始色值、无 fallback Avatar、缺少 Title 的 Sheet、`transition: all`、移动端触控区与不必要抽象。

- [ ] **Step 4：最终复验**

复跑 Task 6 的完整命令，记录测试数量、构建结果和 Playwright 视口。

