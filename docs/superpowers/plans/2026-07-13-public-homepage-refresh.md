# 遇见路得公开首页焕新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将根路径改造成聚焦品牌、关系旅程和真实应用入口的响应式公开首页。

**Architecture:** 保持 Express 静态文件服务方式不变，仅重写根目录的 HTML、CSS 与渐进增强 JavaScript。结构测试读取静态文件，锁定关键 CTA、语义区块和被移除的旧演示功能；浏览器测试负责响应式和交互验收。

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node test runner, Browser/Playwright

---

### Task 1: 锁定公开首页结构

**Files:**
- Create: `server/src/lib/public-homepage.test.js`

- [ ] 写测试，要求品牌首屏、真实应用 CTA、理念/流程/成长区块存在。
- [ ] 写测试，禁止旧演示表单、假统计、套餐和 `transition: all`。
- [ ] 运行 `npm test -- --test-name-pattern="public homepage"` 并确认旧首页失败。

### Task 2: 重建静态首页

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

- [ ] 用语义化内容带替换旧功能演示墙，所有真实 CTA 指向 `/app/` 或 `/app/register`。
- [ ] 建立墨绿、暖白、珊瑚红、亮黄的响应式设计系统。
- [ ] 只实现移动导航、滚动显现和版权年份，不保留模拟业务数据。
- [ ] 运行公开首页结构测试并确认通过。

### Task 3: 浏览器质检

**Files:**
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `app.js`

- [ ] 在桌面视口检查首屏、滚动区块、CTA 和控制台。
- [ ] 在 390px 移动视口检查导航、换行、下一屏提示和横向溢出。
- [ ] 运行前后端完整自动化测试，记录现有构建体积警告但不得引入新错误。
