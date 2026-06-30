# 遇见路得

自研的基督徒严肃婚恋服务原型。根路径提供官网首页，应用区挂载在 `/app`，后端 API 挂载在 `/api`。

## 当前版本

- 首页：项目根目录静态官网，作为用户第一入口。
- 应用区：React/Vite 单页应用，构建后由后端挂载到 `/app`。
- 后端：Node.js + Express + PostgreSQL，提供登录、资料、信仰测试、牧者背书、课程、匹配、私聊、广场和后台审核接口。
- 数据库：`server/db/schema.sql` 定义结构，`server/db/seed.sql` 提供基础种子数据。

## 运行方式

安装依赖：

```bash
npm install --prefix server
npm install --prefix web
```

准备环境变量：

```bash
cp server/.env.example server/.env
```

至少确认 `server/.env` 中的 `DATABASE_URL`、`PORT`、`SESSION_SECRET`。生产环境建议设置 `NODE_ENV=production`，如果走 HTTPS 且需要 secure cookie，再设置 `COOKIE_SECURE=true`。真实 `.env` 不要提交到 git。

准备本地 PostgreSQL fresh 数据库并初始化：

```bash
createdb yujian_lude
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude' npm run migrate --prefix server
```

> 当前 `server/db/schema.sql` 是 fresh install 初始化脚本，不是旧库增量升级脚本。旧库上线前先备份，再运行 schema 诊断；不要把生产库直接当验收临时库。

启动后端：

```bash
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude' PORT=8090 npm start --prefix server
```

开发应用区：

```bash
npm run dev --prefix web
```

生产构建应用区：

```bash
npm run build --prefix web
```

构建产物会直接输出到 `web-dist`。后端启动后访问：

- 官网首页：`http://localhost:8090/`
- 应用区：`http://localhost:8090/app`
- 健康检查：`http://localhost:8090/api/health`

## 上线前体检

默认使用一键 release 验收：

```bash
npm run verify:release --prefix server
```

这个脚本会自动执行：

1. `npm run lint --prefix web`
2. `npm run build --prefix web`
3. `npm run test --prefix server`
4. 创建临时 fresh PostgreSQL 数据库
5. 对临时库执行 schema + seed
6. 启动后端临时服务
7. 探测 `/api/health`、`/`、`/app`、`/app/login`
8. 跑 `verify:mvp`
9. 跑 `verify:real-users`
10. 停止服务并删除临时数据库

要求：`DATABASE_URL` 指向的 PostgreSQL 用户需要有创建和删除临时数据库的权限。`verify:release` 自身不会主动打印连接串或 secret；如果你在业务代码里增加了调试日志，也要避免输出敏感环境变量。

如果只想诊断当前数据库结构：

```bash
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude' npm run diagnose:schema --prefix server
```

`diagnose:schema` 是只读检查，会报告缺表、缺列、缺枚举、缺唯一约束和关键 seed 数据。它适合排查旧本地库为什么不能跑当前代码。

## 分层验收

建议使用独立本地数据库，避免污染已有数据。以下脚本会创建测试账号、管理员、帖子、聊天、通知和小组数据，不要对生产库运行。

### MVP 闭环

`verify:mvp` 是最小 release gate，覆盖注册、资料、信仰测试、背书审核、恋爱必修课、入池、匹配、私聊和全站广场互动。

```bash
dropdb --if-exists yujian_lude_mvp_verify
createdb yujian_lude_mvp_verify
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_mvp_verify' npm run migrate --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_mvp_verify' PORT=8090 npm start --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_mvp_verify' API_BASE='http://localhost:8090/api' npm run verify:mvp --prefix server
```

`verify:mvp` 会自动创建 3 个普通用户和 1 个管理员，并跑通资料、信仰测试、背书提交与审核、恋爱必修课、入池、匹配、私聊和全站广场互动。

### 真实多用户回归

`verify:real-users` 是更宽的回归验收，覆盖签到持久化、未入池限制、多人入池、候选匹配、双向私聊、第三人无权访问私聊、全站帖跨账号可见、关注流、搜索、收藏、评论、点赞、通知、小组发帖审核、申请制小组审批和活动报名。

```bash
dropdb --if-exists yujian_lude_real_users_verify
createdb yujian_lude_real_users_verify
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_real_users_verify' npm run migrate --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_real_users_verify' PORT=8091 npm start --prefix server
DATABASE_URL='postgres://qwe@localhost:5432/yujian_lude_real_users_verify' API_BASE='http://localhost:8091/api' npm run verify:real-users --prefix server
```

`verify:real-users` 会创建 5 个普通用户和 1 个管理员，覆盖签到持久化、未入池限制、多人入池、候选匹配、双向私聊、第三人无权访问私聊、全站帖跨账号可见、关注流、搜索、收藏、评论、点赞、通知、小组发帖审核、申请制小组审批和活动报名。

## 常用检查

```bash
npm run test --prefix server
npm run lint --prefix web
npm run build --prefix web
```

## 常见故障

| 现象 | 处理 |
|---|---|
| `DATABASE_URL is required` | 为验收脚本显式传入 `DATABASE_URL`，或在 `server/.env` 中配置。 |
| `type "user_role" already exists` | 当前库不是 fresh DB；先备份，再用 `diagnose:schema` 判断漂移，或新建临时库验收。 |
| `permission denied to create database` | `verify:release` 需要 PostgreSQL 用户有 `CREATEDB` 权限；换有权限的本地连接串。 |
| 端口被占用 | 后端手动启动时换 `PORT`；`verify:release` 可设置 `RELEASE_VERIFY_PORT=8100`。 |
| `/api/health` 正常但登录或匹配失败 | 健康检查只证明服务进程响应；继续跑 `verify:mvp` 或 `verify:release`。 |
| `/app/login` 刷新 404 | 确认后端挂载了最新 `web-dist`，并重新执行 `npm run build --prefix web`。 |
| 登录刷新后丢失 | 检查 `SESSION_SECRET` 是否稳定、cookie 设置是否与 HTTP/HTTPS 环境一致。 |

## 部署边界

- 提交源码、README、`server/.env.example`、必要的 `web-dist` 构建产物。
- 不提交 `server/.env`、`node_modules/`、日志、Playwright 缓存、数据库 dump、真实 secret。
- 部署前先跑 `npm run verify:release --prefix server`。
- 部署后至少探测 `/api/health`、`/`、`/app`、`/app/login`，再进行一次登录和发帖 smoke test。

## 下一步建议

建议按这个顺序继续做：

1. 增加后台运营面板的搜索、筛选和审计记录。
2. 接入真实 AI 咨询服务，并做用量扣减与风控。
3. 补齐订单、支付记录、退款说明和投诉处理链路。
