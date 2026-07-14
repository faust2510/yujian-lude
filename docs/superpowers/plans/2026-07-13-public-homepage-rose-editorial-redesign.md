# 遇见路得 Rose Editorial 公开首页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将公开首页 `/` 落地为已确认的 Rose Editorial 第一版，同时保持 `/app/` 应用区与后端行为不变。

**Architecture:** 首页继续使用根目录静态 `index.html`、`styles.css`、`app.js`，不引入新的运行时框架。人物媒体保存为本地优化图片，CSS 负责编辑式版式和关系线图案，JavaScript 只负责移动菜单、渐进入场和一次性轨迹动效。

**Tech Stack:** 语义化 HTML、现代 CSS、原生 JavaScript、Node `node:test`、Playwright 浏览器验收。

---

### Task 1: 锁定首页结构与禁用模式

**Files:**
- Modify: `server/src/lib/public-homepage.test.js`

- [ ] **Step 1: 写失败测试**

补充断言，要求首屏包含“遇见路得”“在信仰里，认真靠近一个真实的人。”、“开始遇见”与 `/app/register`，并锁定核心差异、认识与成长、产品实景、关系旅程、品牌寄语及最终 CTA。

- [ ] **Step 2: 锁定媒体与禁用模式**

要求首屏引用新的本地真人媒体，禁止紫色渐变、玻璃模糊、虚构统计、虚构评价、首屏登录框和旧深绿主视觉 token。

- [ ] **Step 3: 运行定向测试确认失败**

Run: `npm test -- --test-name-pattern="public homepage"`

Expected: 新 Rose Editorial 文案或媒体断言失败。

### Task 2: 生成并接入真人纪实媒体

**Files:**
- Create: `assets/rose-editorial-couple.webp`

- [ ] **Step 1: 生成横向人物媒体**

生成一张明亮、真实、克制的东亚成年男女纪实场景；人物关系自然，画面左侧保留足够负空间承载标题，不出现婚纱、拥吻、文字或品牌标识。

- [ ] **Step 2: 检查构图与本地体积**

使用图片查看工具检查人物、负空间和裁切，转换为 WebP，并控制为网页可接受体积。

- [ ] **Step 3: 验证静态资源可读**

Run: `file assets/rose-editorial-couple.webp && test -s assets/rose-editorial-couple.webp`

Expected: 有效、非空 WebP 图片。

### Task 3: 实现 Rose Editorial 语义结构

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 重写首屏与导航**

保留可访问导航和跳转链接，首屏使用新的本地人物媒体、品牌名、指定支撑文案、单一主 CTA“开始遇见”和文本入口“了解我们”。

- [ ] **Step 2: 重写内容区**

依次实现品牌轨迹带、三个无卡片核心差异、薄荷灰认识与成长、脱敏产品实景、连续关系旅程、路得记引用和深色最终 CTA。

- [ ] **Step 3: 校验资源与隐私**

确认所有图片为本地资源，产品截图不包含手机号、邮箱、真实姓名、令牌或其他可识别信息。

### Task 4: 实现粉色编辑式视觉与响应式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 替换设计 token**

落地 `#FDE8EE`、`#FFFDFC`、`#521A2C`、`#D9325D`、`#B9254A`、`#BFD8D0`、`#E4B8C5`，保持成功色和危险色语义化。

- [ ] **Step 2: 实现桌面版式**

实现 74–80svh 首屏、实体色遮罩、现代宋体标题、连续关系线、无卡片栏目、薄荷内容带、产品实景与深色最终 CTA。

- [ ] **Step 3: 实现手机与横屏**

覆盖 360px、390px、768px、1440px 和 667×320 横屏；确保下一段露出、文字不遮挡、按钮不截断、无横向溢出。

- [ ] **Step 4: 完成可访问与降级样式**

保证焦点清晰、菜单打开可滚动、无 JavaScript 时内容可见，并在 `prefers-reduced-motion` 下关闭运动而不隐藏内容。

### Task 5: 实现克制动效与菜单行为

**Files:**
- Modify: `app.js`

- [ ] **Step 1: 保留菜单可访问行为**

保留 Escape 关闭、焦点循环、横竖屏切换解除锁定、点击导航后关闭以及 aria 状态同步。

- [ ] **Step 2: 实现一次性关系轨迹动效**

复用 IntersectionObserver，只为进入视口的轨迹和内容添加一次状态；不实现循环粒子、花瓣或爱心动画。

- [ ] **Step 3: 检查无脚本降级**

Run: `rg -n "no-js|reveal|relationship-line" index.html styles.css app.js`

Expected: 无 JavaScript 时内容默认可见，启用 JavaScript 后才进入等待动画状态。

### Task 6: 自动化与视觉验收

**Files:**
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `app.js`
- Verify: `assets/rose-editorial-couple.webp`

- [ ] **Step 1: 跑首页和服务端测试**

Run: `cd server && npm test`

Expected: 全部测试通过。

- [ ] **Step 2: 跑应用区回归**

Run: `cd web && npm test && npm run lint && npm run build`

Expected: 测试、lint、构建全部通过。

- [ ] **Step 3: 浏览器桌面验收**

在 1440×900 检查首屏、下一段露出、菜单、CTA、锚点、资源 200、控制台无错误，并保存整页截图。

- [ ] **Step 4: 浏览器手机与横屏验收**

在 390×844、360×800 和 667×320 检查菜单焦点、布局换行、图片裁切、无横向溢出与 CTA 可点击。

- [ ] **Step 5: 设计一致性复核**

逐项对照已确认规格检查配色、字体、媒体、关系线、区块顺序、文案、圆角、动效与禁用模式，修复所有可见偏差后再提交。

### Task 7: 提交第一版

**Files:**
- Commit: `server/src/lib/public-homepage.test.js`
- Commit: `index.html`
- Commit: `styles.css`
- Commit: `app.js`
- Commit: `assets/rose-editorial-couple.webp`
- Commit: `docs/superpowers/plans/2026-07-13-public-homepage-rose-editorial-redesign.md`

- [ ] **Step 1: 检查差异边界**

Run: `git diff --check && git status --short`

Expected: 无空白错误，首页改版不包含 `/app/` 业务改动或 `web-dist` 构建噪声。

- [ ] **Step 2: 提交**

Run: `git add docs/superpowers/plans/2026-07-13-public-homepage-rose-editorial-redesign.md server/src/lib/public-homepage.test.js index.html styles.css app.js assets/rose-editorial-couple.webp && git commit -m "Refresh homepage with Rose Editorial design"`
