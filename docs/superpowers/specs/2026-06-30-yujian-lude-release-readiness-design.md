# 遇见路得上线前可靠性收口设计

日期：2026-06-30

## 目标

本轮只做上线前可靠性收口，让遇见路得可以被稳定地本地启动、fresh DB 验收、路由探测和部署前检查。不新增 AI、支付、后台运营功能，也不处理旧 `matcha/` 参考项目。

## 设计决策

| 项目 | 决策 |
|---|---|
| 验收主线 | 以 fresh PostgreSQL 数据库为准，自动跑 lint、build、后端单测、迁移、健康检查、MVP 流程和真实多用户流程 |
| 旧库漂移 | 不在本轮做破坏性自动迁移；提供只读 schema 诊断，明确指出缺表、缺列、缺枚举、缺唯一约束 |
| 启动探测 | 后端启动后探测 `/api/health`、`/`、`/app`、`/app/login` |
| 环境变量 | 保留 `server/.env.example`，补充 README 中的生产注意事项 |
| 脚本入口 | 后端 package scripts 增加 `diagnose:schema` 和 `verify:release` |
| 清理边界 | 验收脚本创建临时数据库并在结束或中断时清理；脚本自身不主动打印 DATABASE_URL 和 secret |

## 脚本设计

### `server/src/scripts/diagnose-schema.js`

只读连接当前 `DATABASE_URL`，检查关键表、列、枚举值和唯一约束。适合回答“当前旧库为什么跑不起来”。输出分为：

- 数据库连接与库名。
- 缺失项列表。
- 通过时提示当前 schema 满足 MVP/真实用户验收所需结构。
- 失败时退出码为 1，方便部署前拦截。

### `server/src/scripts/verify-release.js`

执行完整上线前体检：

1. 跑前端 lint。
2. 跑前端 build。
3. 跑后端 lib 单测。
4. 创建临时 fresh DB。
5. 对临时库执行 `npm run migrate --prefix server`。
6. 使用临时库和独立端口启动后端。
7. 探测 `/api/health`、`/`、`/app`、`/app/login`。
8. 对同一个 fresh DB 跑 `verify:mvp` 和 `verify:real-users`。
9. 停止后端并删除临时数据库。

如果本机 PostgreSQL 账号没有建库权限，脚本会失败并提示使用有建库权限的 `DATABASE_URL`，而不是假装验收通过。

## README 更新

README 需要补：

- 推荐先复制 `server/.env.example`。
- 说明 `verify:release` 是上线前主验收入口。
- 说明 `diagnose:schema` 用于旧库漂移排查。
- 增加部署前检查清单和常见故障处理。

## 验收标准

| 验收项 | 通过标准 |
|---|---|
| schema 诊断 | fresh DB 上 `diagnose:schema` 退出 0 |
| release 验收 | `npm run verify:release --prefix server` 退出 0 |
| 单项验收 | `npm run verify:mvp --prefix server` 与 `npm run verify:real-users --prefix server` 仍可独立运行 |
| 前端质量 | `npm run lint --prefix web` 和 `npm run build --prefix web` 退出 0 |
| 后端质量 | `node --test server/src/lib/*.test.js` 退出 0 |
| 文档 | README 能指导 fresh DB、旧库诊断和上线前体检 |
