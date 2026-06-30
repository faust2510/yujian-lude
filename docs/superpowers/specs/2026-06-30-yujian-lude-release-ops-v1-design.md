# 遇见路得 Release Ops v1 设计

## 目标

把遇见路得从“本地 fresh DB 可验收”推进到“服务器恢复后可以安全部署”的状态。Release Ops v1 不新增用户功能，专注部署地基：生产配置校验、深健康检查、版本化迁移、备份、回滚和可执行部署说明。

## 分阶段范围

### 第一小步：生产配置与健康检查

- `NODE_ENV=production` 时必须显式配置生产数据库连接和足够强的 `SESSION_SECRET`。
- 生产环境不能使用开发默认数据库、开发默认 session secret，也不能开启 `EXPOSE_DEV_TOKENS`。
- 增加 `/api/live` 和 `/api/ready`。
- `/api/live` 只证明进程存活。
- `/api/ready` 至少检查数据库可查询、关键表存在、`web-dist/index.html` 存在。
- release 验收继续探测旧的 `/api/health`，同时新增 `/api/live` 和 `/api/ready`。

### 第二小步：版本化迁移

- 增加 `server/db/migrations/` 和 `schema_migrations` 表。
- 保留 `schema.sql` 做 fresh install。
- 新增 `migrate:up` 只执行未应用的增量迁移。
- 迁移脚本不打印数据库连接串或 secret。
- release 验收继续使用 fresh DB，同时增加迁移脚本的最小演练。

### 第三小步：备份、部署、回滚

- 增加 `ops/` 下的部署 runbook。
- 部署前先跑本地 release 验收。
- 服务器部署前执行数据库备份和当前版本记录。
- 部署流程包括拉代码、安装依赖、构建前端、执行迁移、重启服务、探测 ready。
- 回滚流程包括恢复上一版本代码/构建产物，必要时恢复数据库备份。

## 非目标

- 不在本轮接邮件服务。
- 不在本轮改 AI、支付、推荐算法。
- 不在服务器离线时假装完成线上部署。
- 不提交任何服务器 secret、数据库密码、面板凭据或 token。

## 验收

- `npm run test --prefix server` 通过。
- `npm run lint --prefix web` 通过。
- `npm run build --prefix web` 通过。
- `npm run verify:release --prefix server` 通过。
- 生产配置校验有单元测试覆盖。
- ready 检查失败时返回非 2xx，并给出不包含 secret 的错误摘要。
